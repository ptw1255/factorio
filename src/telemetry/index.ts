import { NodeSDK } from '@opentelemetry/sdk-node'
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http'
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-http'
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics'
import { BatchLogRecordProcessor } from '@opentelemetry/sdk-logs'
import { resourceFromAttributes } from '@opentelemetry/resources'
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions'
import { diag, DiagConsoleLogger, DiagLogLevel } from '@opentelemetry/api'

const OTEL_ENDPOINT = process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318'

// Set diagnostic logging for debugging OTel issues (set to DiagLogLevel.NONE in production)
diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.WARN)

const resource = resourceFromAttributes({
  [ATTR_SERVICE_NAME]: 'factorio-brewery',
  [ATTR_SERVICE_VERSION]: '0.2.0',
  'deployment.environment': process.env.NODE_ENV || 'development',
})

const traceExporter = new OTLPTraceExporter({
  url: `${OTEL_ENDPOINT}/v1/traces`,
})

const metricExporter = new OTLPMetricExporter({
  url: `${OTEL_ENDPOINT}/v1/metrics`,
})

const metricReader = new PeriodicExportingMetricReader({
  exporter: metricExporter,
  exportIntervalMillis: 5000,
})

const logExporter = new OTLPLogExporter({
  url: `${OTEL_ENDPOINT}/v1/logs`,
})

const sdk = new NodeSDK({
  resource,
  traceExporter,
  metricReader,
  logRecordProcessors: [new BatchLogRecordProcessor(logExporter)],
  instrumentations: [
    getNodeAutoInstrumentations({
      '@opentelemetry/instrumentation-pino': { enabled: true },
      // Disable noisy instrumentations
      '@opentelemetry/instrumentation-fs': { enabled: false },
      '@opentelemetry/instrumentation-dns': { enabled: false },
      '@opentelemetry/instrumentation-net': { enabled: false },
    }),
  ],
})

export function initTelemetry(): void {
  sdk.start()
  console.log(`[telemetry] OTel SDK initialized — exporting to ${OTEL_ENDPOINT}`)

  process.on('SIGTERM', () => {
    sdk.shutdown()
      .then(() => console.log('[telemetry] SDK shut down'))
      .catch((err) => console.error('[telemetry] shutdown error:', err))
      .finally(() => process.exit(0))
  })
}
