import { ZeebeGrpcClient } from '@camunda8/sdk/dist/zeebe'
import { generateOrderAgent } from '../agents/generate-order'
import { validateOrder } from '../automation/sales/validate-order'
import { allocateOrder } from '../automation/sales/order-allocation'
import { factoryState } from '../state'
import { parkersKolsch } from '../recipes/parkers-kolsch'
import { generateId } from '../types/shared'
import { SalesProcessVariables } from '../types/sales-variables'
import { workerDuration, stepCount, ordersTotal } from '../metrics/index'

function withMetrics<T>(workerName: string, workerType: 'llm' | 'automation', handler: (job: any) => T): (job: any) => T {
  return (job) => {
    const end = workerDuration.startTimer({ worker: workerName, type: workerType })
    stepCount.inc({ worker: workerName, type: workerType })
    const result = handler(job)
    if (result && typeof (result as any).then === 'function') {
      return (result as any).then((res: any) => { end(); return res }).catch((err: any) => { end(); throw err }) as T
    }
    end()
    return result
  }
}

export function registerSalesWorkers(zeebe: ZeebeGrpcClient): void {
  zeebe.createWorker({
    taskType: 'generate-order',
    timeout: 60000,
    taskHandler: withMetrics('generate-order', 'llm', async (job) => {
      const orderId = generateId('ORD')
      const recipe = parkersKolsch
      try {
        const order = await generateOrderAgent(recipe.id, recipe.name)
        factoryState.addOrder({
          orderId, recipeId: recipe.id, quantity: order.quantity,
          customerId: order.customerId, customerName: order.customerName,
          deliveryAddress: order.deliveryAddress, priority: order.priority,
        })
        console.log(`[generate-order] \u2713 ${orderId} customer="${order.customerName}" qty=${order.quantity} priority=${order.priority}`)
        return job.complete({ orderId, recipeId: recipe.id, recipe: recipe as any, order } as any)
      } catch (err) {
        console.error(`[generate-order] \u2717 error:`, err)
        throw err
      }
    }),
  })

  zeebe.createWorker({
    taskType: 'validate-order',
    taskHandler: withMetrics('validate-order', 'automation', (job) => {
      const vars = job.variables as unknown as SalesProcessVariables
      const result = validateOrder(vars.recipeId, vars.order!.quantity)
      console.log(`[validate-order] \u2713 ${vars.orderId} status=${result.status} available=${result.available} requested=${result.requested}`)
      return job.complete({ fulfillmentStatus: result.status } as any)
    }),
  })

  zeebe.createWorker({
    taskType: 'order-allocation',
    taskHandler: withMetrics('order-allocation', 'automation', (job) => {
      const vars = job.variables as unknown as SalesProcessVariables
      const result = allocateOrder(vars.orderId, vars.recipeId, vars.order!.quantity, vars.fulfillmentStatus!)
      ordersTotal.inc({ priority: vars.order!.priority, fulfillment: vars.fulfillmentStatus! })
      if (vars.fulfillmentStatus === 'FULFILL') factoryState.fulfillOrder(vars.orderId)
      console.log(`[order-allocation] \u2713 ${vars.orderId} allocated=${result.allocated} backordered=${result.backordered}`)
      return job.complete({ allocationResult: result } as any)
    }),
  })

  console.log('[sales] 3 workers registered: generate-order, validate-order, order-allocation')
}
