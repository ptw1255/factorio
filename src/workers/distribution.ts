import { ZeebeGrpcClient } from '@camunda8/sdk/dist/zeebe'
import { routePlanningAgent } from '../agents/route-planning'
import { assignLoad } from '../automation/distribution/load-assignment'
import { calculateTransitTime } from '../automation/distribution/dispatch'
import { confirmDelivery } from '../automation/distribution/delivery-confirmation'
import { DistributionProcessVariables } from '../types/distribution-variables'
import { workerDuration, stepCount, deliveriesTotal } from '../metrics/index'

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

export function registerDistributionWorkers(zeebe: ZeebeGrpcClient): void {
  zeebe.createWorker({
    taskType: 'route-planning',
    timeout: 60000,
    taskHandler: withMetrics('route-planning', 'llm', async (job) => {
      const vars = job.variables as unknown as DistributionProcessVariables
      try {
        const route = await routePlanningAgent(vars.deliveryAddress, vars.palletCount, vars.totalWeight)
        console.log(`[route-planning] \u2713 ${vars.shipmentId} truck=${route.truckId} distance=${route.estimatedDistance}mi`)
        return job.complete({ route } as any)
      } catch (err) {
        console.error(`[route-planning] \u2717 ${vars.shipmentId} error:`, err)
        throw err
      }
    }),
  })

  zeebe.createWorker({
    taskType: 'load-assignment',
    taskHandler: withMetrics('load-assignment', 'automation', (job) => {
      const vars = job.variables as unknown as DistributionProcessVariables
      const truckId = vars.route?.truckId || 'TRUCK-01'
      const loadAssignment = assignLoad(truckId, vars.shipmentId, vars.palletCount, vars.totalWeight)
      console.log(`[load-assignment] \u2713 ${vars.shipmentId} BOL=${loadAssignment.billOfLadingId} pallets=${loadAssignment.palletIds.length}`)
      return job.complete({ loadAssignment } as any)
    }),
  })

  zeebe.createWorker({
    taskType: 'dispatch-truck',
    taskHandler: withMetrics('dispatch-truck', 'automation', (job) => {
      const vars = job.variables as unknown as DistributionProcessVariables
      const distance = vars.route?.estimatedDistance || 50
      const transitTimeSeconds = calculateTransitTime(distance)
      console.log(`[dispatch-truck] \u2713 ${vars.shipmentId} departed, transit=${transitTimeSeconds}s (simulated)`)
      return job.complete({ transitTimeSeconds } as any)
    }),
  })

  zeebe.createWorker({
    taskType: 'delivery-confirmation',
    taskHandler: withMetrics('delivery-confirmation', 'automation', (job) => {
      const vars = job.variables as unknown as DistributionProcessVariables
      const deliveryResult = confirmDelivery(vars.shipmentId)
      deliveriesTotal.inc({ status: deliveryResult.condition })
      console.log(`[delivery-confirmation] \u2713 ${vars.shipmentId} delivered condition=${deliveryResult.condition} signed=${deliveryResult.signedBy}`)
      return job.complete({ deliveryResult } as any)
    }),
  })

  console.log('[distribution] 4 workers registered: route-planning, load-assignment, dispatch-truck, delivery-confirmation')
}
