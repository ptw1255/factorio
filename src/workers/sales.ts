import { ZeebeGrpcClient } from '@camunda8/sdk/dist/zeebe'
import { generateOrderAgent } from '../agents/generate-order'
import { validateOrder } from '../automation/sales/validate-order'
import { allocateOrder } from '../automation/sales/order-allocation'
import { SalesProcessVariables } from '../types/sales-variables'
import { parkersKolsch } from '../recipes/parkers-kolsch'
import { factoryState } from '../state'
import { generateId } from '../types/shared'
import { withTelemetry } from '../telemetry/with-telemetry'
import { createWorkerLogger } from '../telemetry/logger'
import { ordersTotal, revenueTotal } from '../telemetry/metrics'

const log = createWorkerLogger('sales', 'sales')

export function registerSalesWorkers(zeebe: ZeebeGrpcClient): void {
  zeebe.createWorker({
    taskType: 'generate-order',
    timeout: 60000,
    taskHandler: withTelemetry('sales', 'generate-order', 'llm', async (job) => {
      const vars = job.variables as unknown as SalesProcessVariables
      const recipeId = vars.recipeId || parkersKolsch.id
      const recipeName = vars.recipe?.name || parkersKolsch.name
      const goLog = log.child({ worker: 'generate-order' })
      try {
        const order = await generateOrderAgent(recipeId, recipeName)
        const orderId = generateId('ORD')
        factoryState.addOrder({
          orderId, recipeId, quantity: order.quantity,
          customerId: order.customerId, customerName: order.customerName,
          deliveryAddress: order.deliveryAddress, priority: order.priority,
        })
        goLog.info({ orderId, customer: order.customerName, qty: order.quantity, priority: order.priority }, 'order generated')
        return job.complete({ orderId, order, recipeId, recipe: parkersKolsch } as any)
      } catch (err) {
        goLog.error({ err }, 'order generation failed')
        throw err
      }
    }),
  })

  zeebe.createWorker({
    taskType: 'validate-order',
    taskHandler: withTelemetry('sales', 'validate-order', 'automation', (job) => {
      const vars = job.variables as unknown as SalesProcessVariables
      const validation = validateOrder(vars.recipeId, vars.order?.quantity || 0)
      log.child({ worker: 'validate-order' }).info({ orderId: vars.orderId, status: validation.status, available: validation.available, requested: validation.requested }, 'order validated')
      return job.complete({ fulfillmentStatus: validation.status } as any)
    }),
  })

  zeebe.createWorker({
    taskType: 'order-allocation',
    taskHandler: withTelemetry('sales', 'order-allocation', 'automation', (job) => {
      const vars = job.variables as unknown as SalesProcessVariables
      const quantity = vars.order?.quantity || 0
      const allocation = allocateOrder(vars.orderId, vars.recipeId, quantity, vars.fulfillmentStatus || 'BACKORDER')
      if (vars.fulfillmentStatus === 'FULFILL') {
        factoryState.fulfillOrder(vars.orderId)
      }
      ordersTotal.add(1, { priority: vars.order?.priority || 'standard', fulfillment: vars.fulfillmentStatus || 'BACKORDER' })
      if (allocation.allocated > 0) {
        const pricePerCase = parkersKolsch.pricing.basePricePerCase
        revenueTotal.add(allocation.allocated * pricePerCase, { recipe: vars.recipeId })
      }
      log.child({ worker: 'order-allocation' }).info({ orderId: vars.orderId, allocated: allocation.allocated, backordered: allocation.backordered }, 'order allocated')
      return job.complete({ allocationResult: allocation } as any)
    }),
  })

  log.info('3 workers registered: generate-order, validate-order, order-allocation')
}
