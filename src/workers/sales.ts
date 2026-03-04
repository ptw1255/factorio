import { ZeebeGrpcClient } from '@camunda8/sdk/dist/zeebe'
import { generateOrderAgent } from '../agents/generate-order'
import { validateOrder } from '../automation/sales/validate-order'
import { allocateOrder } from '../automation/sales/order-allocation'
import { SalesProcessVariables } from '../types/sales-variables'
import { parkersKolsch } from '../recipes/parkers-kolsch'
import { factoryState } from '../state'
import { generateId } from '../types/shared'
import { workerDuration, stepCount, ordersTotal, revenueTotal } from '../metrics/index'

function withMetrics<T>(
  workerName: string,
  workerType: 'llm' | 'automation',
  handler: (job: any) => T
): (job: any) => T {
  return (job) => {
    const end = workerDuration.startTimer({ worker: workerName, type: workerType })
    stepCount.inc({ worker: workerName, type: workerType })
    const result = handler(job)
    if (result && typeof (result as any).then === 'function') {
      return (result as any)
        .then((res: any) => { end(); return res })
        .catch((err: any) => { end(); throw err }) as T
    }
    end()
    return result
  }
}

export function registerSalesWorkers(zeebe: ZeebeGrpcClient): void {
  // 1. Generate Order (LLM)
  zeebe.createWorker({
    taskType: 'generate-order',
    timeout: 60000,
    taskHandler: withMetrics('generate-order', 'llm', async (job) => {
      const vars = job.variables as unknown as SalesProcessVariables
      const recipeId = vars.recipeId || parkersKolsch.id
      const recipeName = vars.recipe?.name || parkersKolsch.name
      try {
        const order = await generateOrderAgent(recipeId, recipeName)
        const orderId = generateId('ORD')
        factoryState.addOrder({
          orderId,
          recipeId,
          quantity: order.quantity,
          customerId: order.customerId,
          customerName: order.customerName,
          deliveryAddress: order.deliveryAddress,
          priority: order.priority,
        })
        console.log(`[generate-order] ✓ order=${orderId} customer="${order.customerName}" qty=${order.quantity} priority=${order.priority}`)
        return job.complete({ orderId, order, recipeId, recipe: parkersKolsch } as any)
      } catch (err) {
        console.error(`[generate-order] ✗ error:`, err)
        throw err
      }
    }),
  })

  // 2. Validate Order (automation)
  zeebe.createWorker({
    taskType: 'validate-order',
    taskHandler: withMetrics('validate-order', 'automation', (job) => {
      const vars = job.variables as unknown as SalesProcessVariables
      const validation = validateOrder(vars.recipeId, vars.order?.quantity || 0)
      console.log(`[validate-order] ✓ order=${vars.orderId} status=${validation.status} available=${validation.available} requested=${validation.requested}`)
      return job.complete({ fulfillmentStatus: validation.status } as any)
    }),
  })

  // 3. Order Allocation (automation)
  zeebe.createWorker({
    taskType: 'order-allocation',
    taskHandler: withMetrics('order-allocation', 'automation', (job) => {
      const vars = job.variables as unknown as SalesProcessVariables
      const quantity = vars.order?.quantity || 0
      const allocation = allocateOrder(vars.orderId, vars.recipeId, quantity, vars.fulfillmentStatus || 'BACKORDER')
      ordersTotal.inc({ priority: vars.order?.priority || 'standard', fulfillment: vars.fulfillmentStatus || 'BACKORDER' })
      if (allocation.allocated > 0) {
        const pricePerCase = parkersKolsch.pricing.basePricePerCase
        revenueTotal.inc({ recipe: vars.recipeId }, allocation.allocated * pricePerCase)
      }
      console.log(`[order-allocation] ✓ order=${vars.orderId} allocated=${allocation.allocated} backordered=${allocation.backordered}`)
      return job.complete({ allocationResult: allocation } as any)
    }),
  })

  console.log('[sales] 3 workers registered: generate-order, validate-order, order-allocation')
}
