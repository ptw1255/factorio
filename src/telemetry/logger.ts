import pino from 'pino'

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  formatters: {
    level(label) {
      return { level: label }
    },
  },
  // In production, Pino outputs JSON. OTel instrumentation-pino
  // auto-injects traceId and spanId into every log line.
  // For local dev readability, set PRETTY_LOGS=true
  transport: process.env.PRETTY_LOGS
    ? { target: 'pino/file', options: { destination: 1 } }
    : undefined,
})

export function createWorkerLogger(process: string, worker: string) {
  return logger.child({ 'factory.process': process, 'factory.worker': worker })
}
