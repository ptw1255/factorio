import { ZeebeGrpcClient } from '@camunda8/sdk/dist/zeebe'
import { routePlanningAgent } from '../agents/route-planning'
import { assignLoad } from '../automation/distribution/load-assignment'
import { calculateTransitTime } from '../automation/distribution/dispatch'
import { confirmDelivery } from '../automation/distribution/delivery-confirmation'
import { DistributionProcessVariables } from '../types/distribution-variables'
import { withTelemetry } from '../telemetry/with-telemetry'
import { createWorkerLogger } from '../telemetry/logger'
import { deliveriesTotal } from '../telemetry/metrics'

const log = createWorkerLogger('distribution', 'distribution')

export function registerDistributionWorkers(zeebe: ZeebeGrpcClient): void {
  zeebe.createWorker({
    taskType: 'route-planning',
    timeout: 60000,
    taskHandler: withTelemetry('distribution', 'route-planning', 'llm', async (job) => {
      const vars = job.variables as unknown as DistributionProcessVariables
      const rpLog = log.child({ worker: 'route-planning' })
      try {
        const route = await routePlanningAgent(vars.deliveryAddress, vars.palletCount, vars.totalWeight)
        rpLog.info({ shipmentId: vars.shipmentId, truck: route.truckId, distance: route.estimatedDistance, hours: route.estimatedHours }, 'route planned')
        return job.complete({ route } as any)
      } catch (err) {
        rpLog.error({ shipmentId: vars.shipmentId, err }, 'route planning failed')
        throw err
      }
    }),
  })

  zeebe.createWorker({
    taskType: 'load-assignment',
    taskHandler: withTelemetry('distribution', 'load-assignment', 'automation', (job) => {
      const vars = job.variables as unknown as DistributionProcessVariables
      const truckId = vars.route?.truckId || 'TRUCK-01'
      const loadAssignment = assignLoad(truckId, vars.shipmentId, vars.palletCount, vars.totalWeight)
      log.child({ worker: 'load-assignment' }).info({ shipmentId: vars.shipmentId, bol: loadAssignment.billOfLadingId, pallets: loadAssignment.palletIds.length }, 'load assigned')
      return job.complete({ loadAssignment } as any)
    }),
  })

  zeebe.createWorker({
    taskType: 'dispatch-truck',
    taskHandler: withTelemetry('distribution', 'dispatch-truck', 'automation', (job) => {
      const vars = job.variables as unknown as DistributionProcessVariables
      const transitTime = calculateTransitTime(vars.route?.estimatedDistance || 100)
      log.child({ worker: 'dispatch-truck' }).info({ shipmentId: vars.shipmentId, truck: vars.route?.truckId || 'TRUCK-01', transitTime }, 'truck dispatched')
      return job.complete({ transitTimeSeconds: transitTime } as any)
    }),
  })

  zeebe.createWorker({
    taskType: 'delivery-confirmation',
    taskHandler: withTelemetry('distribution', 'delivery-confirmation', 'automation', (job) => {
      const vars = job.variables as unknown as DistributionProcessVariables
      const deliveryResult = confirmDelivery(vars.shipmentId)
      deliveriesTotal.add(1, { status: deliveryResult.condition })
      log.child({ worker: 'delivery-confirmation' }).info({ shipmentId: vars.shipmentId, signedBy: deliveryResult.signedBy, condition: deliveryResult.condition }, 'delivery confirmed')
      return job.complete({ deliveryResult } as any)
    }),
  })

  log.info('4 workers registered: route-planning, load-assignment, dispatch-truck, delivery-confirmation')
}
