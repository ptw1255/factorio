import { trace, SpanStatusCode } from '@opentelemetry/api'
import { workerDuration, stepCount } from './metrics'

const tracer = trace.getTracer('factorio-brewery', '0.2.0')

export function withTelemetry<T>(
  processName: string,
  workerName: string,
  workerType: 'llm' | 'automation',
  handler: (job: any) => T
): (job: any) => T {
  return (job) => {
    const attrs: Record<string, string> = {
      'factory.process': processName,
      'factory.worker': workerName,
      'factory.worker_type': workerType,
    }

    // Extract correlation IDs from job variables
    const vars = job.variables || {}
    if (vars.batchId) attrs['factory.batch_id'] = vars.batchId
    if (vars.orderId) attrs['factory.order_id'] = vars.orderId
    if (vars.shipmentId) attrs['factory.shipment_id'] = vars.shipmentId

    return tracer.startActiveSpan(`worker:${workerName}`, { attributes: attrs }, (span) => {
      const startTime = performance.now()
      stepCount.add(1, { worker: workerName, type: workerType })

      const recordDuration = () => {
        const duration = (performance.now() - startTime) / 1000
        workerDuration.record(duration, { worker: workerName, type: workerType })
      }

      try {
        const result = handler(job)

        if (result && typeof (result as any).then === 'function') {
          return (result as any)
            .then((res: any) => {
              recordDuration()
              span.setStatus({ code: SpanStatusCode.OK })
              span.end()
              return res
            })
            .catch((err: any) => {
              recordDuration()
              span.setStatus({ code: SpanStatusCode.ERROR, message: err.message })
              span.recordException(err)
              span.end()
              throw err
            }) as T
        }

        recordDuration()
        span.setStatus({ code: SpanStatusCode.OK })
        span.end()
        return result
      } catch (err: any) {
        recordDuration()
        span.setStatus({ code: SpanStatusCode.ERROR, message: err.message })
        span.recordException(err)
        span.end()
        throw err
      }
    })
  }
}
