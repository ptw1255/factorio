# FACTORIO Observability Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace prom-client with a unified OpenTelemetry SDK for metrics, logs, and traces — all routed through an OTel Collector to Prometheus, Loki, and Tempo, with 3 Grafana dashboards as the command center.

**Architecture:** App uses `@opentelemetry/sdk-node` for all three signals, sending OTLP to a Collector container. Pino provides structured JSON logging bridged to OTel. A shared `withTelemetry` wrapper replaces 7 duplicated `withMetrics` functions. Grafana gets 3 provisioned dashboards (Factory Overview, LLM Performance, Business Metrics) with cross-signal correlation.

**Tech Stack:** OpenTelemetry SDK for Node.js, Pino structured logger, OTel Collector, Grafana Loki 3.4, Grafana Tempo 2.7, Prometheus (existing), Grafana (existing)

---

### Task 0: Install Dependencies

**Files:**
- Modify: `package.json`

**Step 1: Install OpenTelemetry packages and Pino**

Run:
```bash
cd /tmp/factorio && npm install \
  @opentelemetry/sdk-node \
  @opentelemetry/auto-instrumentations-node \
  @opentelemetry/exporter-metrics-otlp-http \
  @opentelemetry/exporter-trace-otlp-http \
  @opentelemetry/exporter-logs-otlp-http \
  @opentelemetry/api \
  @opentelemetry/api-logs \
  @opentelemetry/instrumentation-pino \
  @opentelemetry/resources \
  @opentelemetry/semantic-conventions \
  @opentelemetry/sdk-metrics \
  @opentelemetry/sdk-trace-node \
  @opentelemetry/sdk-logs \
  pino
```

**Step 2: Install Pino types**

Run:
```bash
cd /tmp/factorio && npm install --save-dev @types/pino
```

**Step 3: Remove prom-client and express**

Run:
```bash
cd /tmp/factorio && npm uninstall prom-client express && npm uninstall --save-dev @types/express
```

**Step 4: Verify install**

Run: `cd /tmp/factorio && npx tsc --noEmit 2>&1 | head -5`
Expected: Errors about missing `prom-client` and `express` imports (expected — we'll fix those in subsequent tasks)

**Step 5: Commit**

```bash
cd /tmp/factorio && git add package.json package-lock.json
git commit -m "chore: replace prom-client/express with OpenTelemetry SDK + Pino"
```

---

### Task 1: Create Telemetry SDK Initialization

**Files:**
- Create: `src/telemetry/index.ts`

**Step 1: Create the telemetry initialization module**

Create `src/telemetry/index.ts`:

```typescript
import { NodeSDK } from '@opentelemetry/sdk-node'
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http'
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-http'
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics'
import { BatchLogRecordProcessor, LoggerProvider } from '@opentelemetry/sdk-logs'
import { Resource } from '@opentelemetry/resources'
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions'
import { diag, DiagConsoleLogger, DiagLogLevel } from '@opentelemetry/api'

const OTEL_ENDPOINT = process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318'

// Set diagnostic logging for debugging OTel issues (set to DiagLogLevel.NONE in production)
diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.WARN)

const resource = new Resource({
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

const loggerProvider = new LoggerProvider({ resource })
loggerProvider.addLogRecordProcessor(new BatchLogRecordProcessor(logExporter))

const sdk = new NodeSDK({
  resource,
  traceExporter,
  metricReader,
  logRecordExporter: logExporter,
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

export { loggerProvider }
```

**Step 2: Verify it compiles**

Run: `cd /tmp/factorio && npx tsc --noEmit src/telemetry/index.ts 2>&1 | head -10`

Note: This may show errors from other files still importing prom-client — that's expected. Focus on `src/telemetry/index.ts` itself having no errors.

**Step 3: Commit**

```bash
cd /tmp/factorio && git add src/telemetry/index.ts
git commit -m "feat: add OpenTelemetry SDK initialization"
```

---

### Task 2: Create Pino Logger

**Files:**
- Create: `src/telemetry/logger.ts`

**Step 1: Create the structured logger**

Create `src/telemetry/logger.ts`:

```typescript
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
```

**Step 2: Commit**

```bash
cd /tmp/factorio && git add src/telemetry/logger.ts
git commit -m "feat: add Pino structured logger with OTel correlation"
```

---

### Task 3: Create OTel Metrics (Replace prom-client)

**Files:**
- Create: `src/telemetry/metrics.ts`
- Delete: `src/metrics/index.ts`
- Delete: `src/metrics/middleware.ts`

**Step 1: Create OTel metrics module**

Create `src/telemetry/metrics.ts`:

```typescript
import { metrics } from '@opentelemetry/api'

const meter = metrics.getMeter('factorio-brewery', '0.2.0')

// --- Phase 1: Factory metrics ---

export const workerDuration = meter.createHistogram('factory_worker_duration_seconds', {
  description: 'Duration of individual workers in seconds',
  unit: 's',
  advice: {
    explicitBucketBoundaries: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30, 60],
  },
})

export const stepCount = meter.createCounter('factory_step_count_total', {
  description: 'Total steps executed by worker',
})

export const batchesTotal = meter.createCounter('factory_batches_total', {
  description: 'Total batches by recipe and status',
})

export const bottlesProduced = meter.createCounter('factory_bottles_produced_total', {
  description: 'Total bottles produced',
})

export const bottlesRejected = meter.createCounter('factory_bottles_rejected_total', {
  description: 'Total bottles rejected',
})

export const armCycles = meter.createCounter('factory_arm_cycles_total', {
  description: 'Robotic arm cycle count',
})

export const armFaults = meter.createCounter('factory_arm_faults_total', {
  description: 'Robotic arm fault count',
})

export const conveyorEfficiency = meter.createGauge('factory_conveyor_efficiency', {
  description: 'Conveyor throughput efficiency ratio',
})

export const activeProcesses = meter.createGauge('factory_active_processes', {
  description: 'Number of active process instances',
})

// --- Phase 2: Business metrics ---

export const ordersTotal = meter.createCounter('factory_orders_total', {
  description: 'Total orders by priority and fulfillment status',
})

export const revenueTotal = meter.createCounter('factory_revenue_total', {
  description: 'Total revenue in dollars',
})

export const cogsTotal = meter.createCounter('factory_cogs_total', {
  description: 'Total cost of goods sold',
})

export const cashBalance = meter.createGauge('factory_cash_balance', {
  description: 'Current cash balance',
})

export const inventoryValue = meter.createGauge('factory_inventory_value', {
  description: 'Current inventory value',
})

export const deliveriesTotal = meter.createCounter('factory_deliveries_total', {
  description: 'Total deliveries by status',
})
```

**Step 2: Delete old metrics files**

Run:
```bash
rm /tmp/factorio/src/metrics/index.ts /tmp/factorio/src/metrics/middleware.ts
rmdir /tmp/factorio/src/metrics
```

**Step 3: Commit**

```bash
cd /tmp/factorio && git add src/telemetry/metrics.ts
git add -u src/metrics/
git commit -m "feat: replace prom-client metrics with OpenTelemetry Meter API"
```

---

### Task 4: Create Shared withTelemetry Wrapper

**Files:**
- Create: `src/telemetry/with-telemetry.ts`

**Step 1: Write the test**

Create `src/telemetry/with-telemetry.test.ts`:

```typescript
import { withTelemetry } from './with-telemetry'

describe('withTelemetry', () => {
  it('calls handler and returns result for sync handlers', () => {
    const handler = jest.fn((job: any) => ({ success: true }))
    const wrapped = withTelemetry('test-process', 'test-worker', 'automation', handler)
    const fakeJob = { variables: { batchId: 'BATCH-001' } }
    const result = wrapped(fakeJob)
    expect(handler).toHaveBeenCalledWith(fakeJob)
    expect(result).toEqual({ success: true })
  })

  it('calls handler and returns result for async handlers', async () => {
    const handler = jest.fn(async (job: any) => ({ success: true }))
    const wrapped = withTelemetry('test-process', 'test-worker', 'llm', handler)
    const fakeJob = { variables: { batchId: 'BATCH-002' } }
    const result = await wrapped(fakeJob)
    expect(handler).toHaveBeenCalledWith(fakeJob)
    expect(result).toEqual({ success: true })
  })

  it('propagates errors from sync handlers', () => {
    const handler = jest.fn(() => { throw new Error('test error') })
    const wrapped = withTelemetry('test-process', 'test-worker', 'automation', handler)
    expect(() => wrapped({ variables: {} })).toThrow('test error')
  })

  it('propagates errors from async handlers', async () => {
    const handler = jest.fn(async () => { throw new Error('async error') })
    const wrapped = withTelemetry('test-process', 'test-worker', 'llm', handler)
    await expect(wrapped({ variables: {} })).rejects.toThrow('async error')
  })
})
```

**Step 2: Run the test to verify it fails**

Run: `cd /tmp/factorio && npx jest src/telemetry/with-telemetry.test.ts --no-coverage 2>&1 | tail -5`
Expected: FAIL — Cannot find module `./with-telemetry`

**Step 3: Create the withTelemetry wrapper**

Create `src/telemetry/with-telemetry.ts`:

```typescript
import { trace, SpanStatusCode, context } from '@opentelemetry/api'
import { workerDuration, stepCount } from './metrics'

const tracer = trace.getTracer('factorio-brewery', '0.2.0')

export function withTelemetry<T>(
  processName: string,
  workerName: string,
  workerType: 'llm' | 'automation',
  handler: (job: any) => T
): (job: any) => T {
  return (job) => {
    const attrs = {
      'factory.process': processName,
      'factory.worker': workerName,
      'factory.worker_type': workerType,
    }

    // Extract correlation IDs from job variables
    const vars = job.variables || {}
    if (vars.batchId) attrs['factory.batch_id' as keyof typeof attrs] = vars.batchId
    if (vars.orderId) attrs['factory.order_id' as keyof typeof attrs] = vars.orderId
    if (vars.shipmentId) attrs['factory.shipment_id' as keyof typeof attrs] = vars.shipmentId

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
```

**Step 4: Run the test to verify it passes**

Run: `cd /tmp/factorio && npx jest src/telemetry/with-telemetry.test.ts --no-coverage 2>&1 | tail -5`
Expected: 4 tests PASS

**Step 5: Commit**

```bash
cd /tmp/factorio && git add src/telemetry/with-telemetry.ts src/telemetry/with-telemetry.test.ts
git commit -m "feat: add shared withTelemetry wrapper with spans and metrics"
```

---

### Task 5: Migrate Brewing Workers

**Files:**
- Modify: `src/workers/brewing.ts`

**Step 1: Replace imports, withMetrics, and console.log**

Replace the entire file `src/workers/brewing.ts`:

```typescript
import { ZeebeGrpcClient } from '@camunda8/sdk/dist/zeebe'
import { simulateMash } from '../automation/brewing/mashing'
import { simulateLauter } from '../automation/brewing/lautering'
import { simulateBoil } from '../automation/brewing/boiling'
import { simulateCooling } from '../automation/brewing/cooling'
import { initFermentation, checkFermentation } from '../automation/brewing/fermentation'
import { checkLagering } from '../automation/brewing/lagering'
import { batchQCAgent } from '../agents/batch-qc'
import { BrewingProcessVariables } from '../types/brewing-variables'
import { withTelemetry } from '../telemetry/with-telemetry'
import { createWorkerLogger } from '../telemetry/logger'
import { batchesTotal } from '../telemetry/metrics'

const log = createWorkerLogger('brewing', 'brewing')

export function registerBrewingWorkers(zeebe: ZeebeGrpcClient): void {
  // 1. Mashing
  zeebe.createWorker({
    taskType: 'mashing',
    taskHandler: withTelemetry('brewing', 'mashing', 'automation', (job) => {
      const vars = job.variables as unknown as BrewingProcessVariables
      const mashResult = simulateMash(vars.recipe)
      log.child({ worker: 'mashing' }).info({ batchId: vars.batchId, temp: mashResult.mashTemp, gravity: mashResult.wortComposition.gravity }, 'mash complete')
      return job.complete({ mashResult } as any)
    }),
  })

  // 2. Lautering
  zeebe.createWorker({
    taskType: 'lautering',
    taskHandler: withTelemetry('brewing', 'lautering', 'automation', (job) => {
      const vars = job.variables as unknown as BrewingProcessVariables
      const lauterResult = simulateLauter(vars.mashResult!, vars.recipe)
      log.child({ worker: 'lautering' }).info({ batchId: vars.batchId, volume: lauterResult.wortVolume, efficiency: lauterResult.efficiency }, 'lauter complete')
      return job.complete({ lauterResult } as any)
    }),
  })

  // 3. Boil & Hop Additions
  zeebe.createWorker({
    taskType: 'boil-hop-addition',
    taskHandler: withTelemetry('brewing', 'boil-hop-addition', 'automation', (job) => {
      const vars = job.variables as unknown as BrewingProcessVariables
      const boilResult = simulateBoil(vars.lauterResult!, vars.recipe)
      log.child({ worker: 'boil-hop-addition' }).info({ batchId: vars.batchId, IBU: boilResult.totalIBU, postBoilVolume: boilResult.postBoilVolume }, 'boil complete')
      return job.complete({ boilResult } as any)
    }),
  })

  // 4. Cooling
  zeebe.createWorker({
    taskType: 'cooling',
    taskHandler: withTelemetry('brewing', 'cooling', 'automation', (job) => {
      const vars = job.variables as unknown as BrewingProcessVariables
      const coolingResult = simulateCooling(vars.boilResult!, vars.recipe)
      log.child({ worker: 'cooling' }).info({ batchId: vars.batchId, startTemp: coolingResult.startTemp, endTemp: coolingResult.endTemp, duration: coolingResult.coolingDuration }, 'cooling complete')
      return job.complete({ coolingResult } as any)
    }),
  })

  // 5. Fermentation Check
  zeebe.createWorker({
    taskType: 'fermentation-check',
    taskHandler: withTelemetry('brewing', 'fermentation-check', 'automation', (job) => {
      const vars = job.variables as unknown as BrewingProcessVariables

      let fermentationState
      if (!vars.fermentationState) {
        const ogReading = vars.boilResult
          ? 1 + (vars.mashResult?.wortComposition.gravity || 1.048) - 1
          : vars.recipe.process.targetOG
        fermentationState = initFermentation(vars.recipe, ogReading)
      } else {
        fermentationState = checkFermentation(vars.fermentationState, vars.recipe)
      }

      log.child({ worker: 'fermentation-check' }).info({ batchId: vars.batchId, day: fermentationState.day, gravity: fermentationState.currentGravity, attenuation: fermentationState.attenuation, stuck: fermentationState.stuck }, 'fermentation check')

      return job.complete({ fermentationState } as any)
    }),
  })

  // 6. Lagering Complete
  zeebe.createWorker({
    taskType: 'lagering-complete',
    taskHandler: withTelemetry('brewing', 'lagering-complete', 'automation', (job) => {
      const vars = job.variables as unknown as BrewingProcessVariables
      const targetDays = vars.recipe.process.lageringDays ?? 28
      const lageringResult = checkLagering(vars.recipe, targetDays)

      const og = vars.fermentationState?.gravityReadings[0]?.value ?? vars.recipe.process.targetOG
      const fg = vars.fermentationState?.currentGravity ?? vars.recipe.process.targetFG
      const finalABV = Math.round((og - fg) * 131.25 * 10) / 10
      const finalGravity = fg
      const finalVolume = vars.boilResult?.postBoilVolume ?? 5

      log.child({ worker: 'lagering-complete' }).info({ batchId: vars.batchId, clarity: lageringResult.clarityScore, ABV: finalABV }, 'lagering complete')
      batchesTotal.add(1, { recipe: vars.recipeId, status: 'lagered' })

      return job.complete({ lageringResult, finalABV, finalGravity, finalVolume } as any)
    }),
  })

  // 7. Batch QC (LLM)
  zeebe.createWorker({
    taskType: 'batch-qc',
    timeout: 60000,
    taskHandler: withTelemetry('brewing', 'batch-qc', 'llm', async (job) => {
      const vars = job.variables as unknown as BrewingProcessVariables
      const qcLog = log.child({ worker: 'batch-qc' })
      try {
        const batchQC = await batchQCAgent(vars, vars.recipe)
        qcLog.info({ batchId: vars.batchId, score: batchQC.qualityScore, passed: batchQC.passed }, 'batch QC complete')
        batchesTotal.add(1, { recipe: vars.recipeId, status: batchQC.passed ? 'qc-passed' : 'qc-failed' })
        return job.complete({ batchQC } as any)
      } catch (err) {
        qcLog.error({ batchId: vars.batchId, err }, 'batch QC failed')
        throw err
      }
    }),
  })

  log.info('7 workers registered: mashing, lautering, boil-hop-addition, cooling, fermentation-check, lagering-complete, batch-qc')
}
```

**Step 2: Verify it compiles**

Run: `cd /tmp/factorio && npx tsc --noEmit src/workers/brewing.ts 2>&1 | head -5`

**Step 3: Commit**

```bash
cd /tmp/factorio && git add src/workers/brewing.ts
git commit -m "refactor: migrate brewing workers to OTel + Pino"
```

---

### Task 6: Migrate Bottling Workers

**Files:**
- Modify: `src/workers/bottling.ts`

**Step 1: Replace the entire file**

Replace `src/workers/bottling.ts`:

```typescript
import { ZeebeGrpcClient } from '@camunda8/sdk/dist/zeebe'
import { calculateVolume } from '../automation/bottling/volume-reading'
import { simulateFilling } from '../automation/bottling/filling'
import { sampleQuality } from '../automation/bottling/quality-sampling'
import { labelGenerationAgent } from '../agents/label-generation'
import { BottlingProcessVariables } from '../types/bottling-variables'
import { withTelemetry } from '../telemetry/with-telemetry'
import { createWorkerLogger } from '../telemetry/logger'
import { bottlesProduced, bottlesRejected } from '../telemetry/metrics'

const log = createWorkerLogger('bottling', 'bottling')

export function registerBottlingWorkers(zeebe: ZeebeGrpcClient): void {
  zeebe.createWorker({
    taskType: 'volume-reading',
    taskHandler: withTelemetry('bottling', 'volume-reading', 'automation', (job) => {
      const vars = job.variables as unknown as BottlingProcessVariables
      const tankVolume = (vars as any).finalVolume || 5
      const volumeReading = calculateVolume(vars.batchId, tankVolume, vars.recipe)
      log.child({ worker: 'volume-reading' }).info({ batchId: vars.batchId, bottles: volumeReading.estimatedBottles, cases: volumeReading.estimatedCases }, 'volume reading')
      return job.complete({ volumeReading } as any)
    }),
  })

  zeebe.createWorker({
    taskType: 'label-generation',
    timeout: 60000,
    taskHandler: withTelemetry('bottling', 'label-generation', 'llm', async (job) => {
      const vars = job.variables as unknown as BottlingProcessVariables
      const llmLog = log.child({ worker: 'label-generation' })
      try {
        const labelData = await labelGenerationAgent(vars.batchId, vars.recipe, vars.qualityScore || 85, vars.tastingNotes || 'Clean, crisp, well-balanced')
        llmLog.info({ batchId: vars.batchId, productName: labelData.productName }, 'label generated')
        return job.complete({ labelData } as any)
      } catch (err) {
        llmLog.error({ batchId: vars.batchId, err }, 'label generation failed')
        throw err
      }
    }),
  })

  zeebe.createWorker({
    taskType: 'filling-simulation',
    taskHandler: withTelemetry('bottling', 'filling-simulation', 'automation', (job) => {
      const vars = job.variables as unknown as BottlingProcessVariables
      const fillingResult = simulateFilling(vars.volumeReading!)
      bottlesProduced.add(fillingResult.bottlesFilled, { recipe: vars.recipeId })
      bottlesRejected.add(fillingResult.bottlesBroken, { recipe: vars.recipeId, reason: 'breakage' })
      log.child({ worker: 'filling-simulation' }).info({ batchId: vars.batchId, filled: fillingResult.bottlesFilled, broken: fillingResult.bottlesBroken }, 'filling complete')
      return job.complete({ fillingResult } as any)
    }),
  })

  zeebe.createWorker({
    taskType: 'quality-sampling',
    taskHandler: withTelemetry('bottling', 'quality-sampling', 'automation', (job) => {
      const vars = job.variables as unknown as BottlingProcessVariables
      const actualABV = (vars as any).finalABV || vars.recipe.process.targetABV
      const qualitySample = sampleQuality(vars.recipe, actualABV)
      log.child({ worker: 'quality-sampling' }).info({ batchId: vars.batchId, passed: qualitySample.overallPassed, carbonation: qualitySample.carbonation.level, clarity: qualitySample.clarity.score }, 'quality sample')
      return job.complete({ qualitySample } as any)
    }),
  })

  log.info('4 workers registered: volume-reading, label-generation, filling-simulation, quality-sampling')
}
```

**Step 2: Commit**

```bash
cd /tmp/factorio && git add src/workers/bottling.ts
git commit -m "refactor: migrate bottling workers to OTel + Pino"
```

---

### Task 7: Migrate Crating Workers

**Files:**
- Modify: `src/workers/crating.ts`

**Step 1: Replace the entire file**

Replace `src/workers/crating.ts`:

```typescript
import { ZeebeGrpcClient } from '@camunda8/sdk/dist/zeebe'
import { inspectBottleBatch } from '../automation/crating/inspection'
import { initCasePackerArm, simulateCasePackingCycle } from '../automation/crating/case-packing'
import { simulatePalletizing } from '../automation/crating/palletizing'
import { initConveyor, checkConveyorHealth } from '../automation/crating/conveyor-health'
import { visionReviewAgent } from '../agents/vision-review'
import { predictiveMaintenanceAgent } from '../agents/predictive-maintenance'
import { CratingProcessVariables } from '../types/crating-variables'
import { withTelemetry } from '../telemetry/with-telemetry'
import { createWorkerLogger } from '../telemetry/logger'
import { armCycles, armFaults, bottlesRejected, conveyorEfficiency } from '../telemetry/metrics'

const log = createWorkerLogger('crating', 'crating')

export function registerCratingWorkers(zeebe: ZeebeGrpcClient): void {
  zeebe.createWorker({
    taskType: 'line-initialize',
    taskHandler: withTelemetry('crating', 'line-initialize', 'automation', (job) => {
      const vars = job.variables as unknown as CratingProcessVariables
      const lineStatus = {
        initialized: true,
        inspectorArm: initCasePackerArm('ARM-INSP-01'),
        casePackerArm: initCasePackerArm('ARM-CP-01'),
        palletizerArm: initCasePackerArm('ARM-PLT-01'),
        conveyorA: initConveyor('CONV-A', 60, 100),
        conveyorB: initConveyor('CONV-B', 45, 150),
        conveyorC: initConveyor('CONV-C', 30, 80),
      }
      log.child({ worker: 'line-initialize' }).info({ batchId: vars.batchId }, '3 arms + 3 conveyors initialized')
      return job.complete({ lineStatus } as any)
    }),
  })

  zeebe.createWorker({
    taskType: 'bottle-inspect',
    taskHandler: withTelemetry('crating', 'bottle-inspect', 'automation', (job) => {
      const vars = job.variables as unknown as CratingProcessVariables
      const batchSize = Math.min(vars.bottleCount || 24, 24)
      const inspectionResult = inspectBottleBatch(batchSize)
      bottlesRejected.add(inspectionResult.rejected, { recipe: vars.recipeId, reason: 'inspection' })
      log.child({ worker: 'bottle-inspect' }).info({ batchId: vars.batchId, pass: inspectionResult.passed, reject: inspectionResult.rejected, review: inspectionResult.review }, 'inspection complete')
      return job.complete({ inspectionResult } as any)
    }),
  })

  zeebe.createWorker({
    taskType: 'vision-review',
    timeout: 60000,
    taskHandler: withTelemetry('crating', 'vision-review', 'llm', async (job) => {
      const vars = job.variables as unknown as CratingProcessVariables
      const reviewBottles = vars.inspectionResult?.inspections.filter(i => i.overallVerdict === 'review') || []
      const vLog = log.child({ worker: 'vision-review' })

      const results = []
      for (const bottle of reviewBottles) {
        try {
          const review = await visionReviewAgent(bottle)
          results.push({ bottleId: bottle.bottleId, ...review })
        } catch (err) {
          vLog.error({ bottleId: bottle.bottleId, err }, 'vision review failed')
          results.push({ bottleId: bottle.bottleId, finalVerdict: 'reject' as const, reasoning: 'LLM error — rejected for safety', confidence: 0 })
        }
      }

      const passed = results.filter(r => r.finalVerdict === 'pass').length
      const rejected = results.filter(r => r.finalVerdict === 'reject').length
      vLog.info({ batchId: vars.batchId, reviewed: results.length, passed, rejected }, 'vision review complete')
      return job.complete({ visionReviewResults: results } as any)
    }),
  })

  zeebe.createWorker({
    taskType: 'case-packer-cycle',
    taskHandler: withTelemetry('crating', 'case-packer-cycle', 'automation', (job) => {
      const vars = job.variables as unknown as CratingProcessVariables
      const armState = vars.lineStatus?.casePackerArm || initCasePackerArm('ARM-CP-01')
      const totalPacked = vars.casePackingResult?.totalCasesPacked || 0
      const { armState: newArmState, result, fault } = simulateCasePackingCycle(armState, totalPacked)
      armCycles.add(1, { arm_id: newArmState.armId })
      if (fault) {
        armFaults.add(1, { arm_id: newArmState.armId, fault_code: fault.faultCode })
      }
      log.child({ worker: 'case-packer-cycle' }).info({ batchId: vars.batchId, packed: result.totalCasesPacked, fault: fault?.faultCode || 'none' }, 'case packing cycle')
      return job.complete({ casePackingResult: result, casePackerFault: fault || null } as any)
    }),
  })

  zeebe.createWorker({
    taskType: 'arm-recovery',
    taskHandler: withTelemetry('crating', 'arm-recovery', 'automation', (job) => {
      const vars = job.variables as unknown as CratingProcessVariables
      const armState = vars.casePackingResult?.armState || initCasePackerArm('ARM-CP-01')
      const recoveredState = {
        ...armState,
        status: 'idle' as const,
        gripperState: 'open' as const,
        gripperPressure: 0,
        motorTemperature: Math.max(35, armState.motorTemperature - 10),
      }
      if (recoveredState.faultHistory.length > 0) {
        const latest = { ...recoveredState.faultHistory[recoveredState.faultHistory.length - 1], resolved: true }
        recoveredState.faultHistory = [...recoveredState.faultHistory.slice(0, -1), latest]
      }
      log.child({ worker: 'arm-recovery' }).info({ batchId: vars.batchId, temp: recoveredState.motorTemperature }, 'arm re-homed')
      return job.complete({ casePackerFault: null } as any)
    }),
  })

  zeebe.createWorker({
    taskType: 'palletizer-cycle',
    taskHandler: withTelemetry('crating', 'palletizer-cycle', 'automation', (job) => {
      const vars = job.variables as unknown as CratingProcessVariables
      const totalCases = vars.casePackingResult?.totalCasesPacked || 1
      const palletResult = simulatePalletizing(totalCases, vars.recipe)
      log.child({ worker: 'palletizer-cycle' }).info({ batchId: vars.batchId, palletId: palletResult.palletId, cases: palletResult.totalCases, stable: palletResult.stable }, 'palletized')
      return job.complete({ palletResult } as any)
    }),
  })

  zeebe.createWorker({
    taskType: 'pallet-wrap-stage',
    taskHandler: withTelemetry('crating', 'pallet-wrap-stage', 'automation', (job) => {
      const vars = job.variables as unknown as CratingProcessVariables
      const palletId = vars.palletResult?.palletId || 'unknown'
      if (vars.lineStatus?.conveyorC) {
        const health = checkConveyorHealth(vars.lineStatus.conveyorC)
        conveyorEfficiency.record(health.efficiency, { conveyor_id: health.conveyorId })
      }
      log.child({ worker: 'pallet-wrap-stage' }).info({ batchId: vars.batchId, palletId }, 'wrapped and staged')
      return job.complete({ palletWrapped: true } as any)
    }),
  })

  zeebe.createWorker({
    taskType: 'predictive-maintenance',
    timeout: 60000,
    taskHandler: withTelemetry('crating', 'predictive-maintenance', 'llm', async (job) => {
      const vars = job.variables as unknown as CratingProcessVariables
      const armToAnalyze = vars.casePackingResult?.armState || vars.lineStatus?.casePackerArm
      const pmLog = log.child({ worker: 'predictive-maintenance' })

      if (!armToAnalyze) {
        pmLog.info({ batchId: vars.batchId }, 'no telemetry to analyze')
        return job.complete({ maintenancePrediction: null } as any)
      }

      try {
        const prediction = await predictiveMaintenanceAgent(armToAnalyze)
        pmLog.info({ batchId: vars.batchId, urgency: prediction.urgency, confidence: prediction.confidence }, 'prediction complete')
        return job.complete({ maintenancePrediction: { armId: armToAnalyze.armId, ...prediction } } as any)
      } catch (err) {
        pmLog.error({ batchId: vars.batchId, err }, 'prediction failed')
        return job.complete({ maintenancePrediction: null } as any)
      }
    }),
  })

  log.info('8 workers registered: line-initialize, bottle-inspect, vision-review, case-packer-cycle, arm-recovery, palletizer-cycle, pallet-wrap-stage, predictive-maintenance')
}
```

**Step 2: Commit**

```bash
cd /tmp/factorio && git add src/workers/crating.ts
git commit -m "refactor: migrate crating workers to OTel + Pino"
```

---

### Task 8: Migrate Phase 2 Workers (Sales, Materials, Distribution, Accounting)

**Files:**
- Modify: `src/workers/sales.ts`
- Modify: `src/workers/materials.ts`
- Modify: `src/workers/distribution.ts`
- Modify: `src/workers/accounting.ts`

**Step 1: Replace `src/workers/sales.ts`**

```typescript
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
```

**Step 2: Replace `src/workers/materials.ts`**

```typescript
import { ZeebeGrpcClient } from '@camunda8/sdk/dist/zeebe'
import { checkInventory } from '../automation/materials/check-inventory'
import { calculateRequirements } from '../automation/materials/calculate-requirements'
import { receiveMaterials } from '../automation/materials/receive-materials'
import { findSuppliersAgent } from '../agents/find-suppliers'
import { MaterialsProcessVariables } from '../types/materials-variables'
import { generateId } from '../types/shared'
import { withTelemetry } from '../telemetry/with-telemetry'
import { createWorkerLogger } from '../telemetry/logger'
import { cogsTotal, inventoryValue } from '../telemetry/metrics'

const log = createWorkerLogger('materials', 'materials')

export function registerMaterialsWorkers(zeebe: ZeebeGrpcClient): void {
  zeebe.createWorker({
    taskType: 'check-inventory',
    taskHandler: withTelemetry('materials', 'check-inventory', 'automation', (job) => {
      const vars = job.variables as unknown as MaterialsProcessVariables
      const inventoryCheck = checkInventory(vars.recipe)
      const shortageCount = Object.keys(inventoryCheck.shortages).length
      log.child({ worker: 'check-inventory' }).info({ batchId: vars.batchId, sufficient: inventoryCheck.sufficient, shortages: shortageCount }, 'inventory checked')
      return job.complete({ inventoryCheck } as any)
    }),
  })

  zeebe.createWorker({
    taskType: 'calculate-requirements',
    taskHandler: withTelemetry('materials', 'calculate-requirements', 'automation', (job) => {
      const vars = job.variables as unknown as MaterialsProcessVariables
      const requirements = calculateRequirements(vars.recipe, 1)
      const ingredientCount = Object.keys(requirements).length
      log.child({ worker: 'calculate-requirements' }).info({ batchId: vars.batchId, ingredients: ingredientCount }, 'requirements calculated')
      return job.complete({ requirements } as any)
    }),
  })

  zeebe.createWorker({
    taskType: 'find-suppliers',
    timeout: 60000,
    taskHandler: withTelemetry('materials', 'find-suppliers', 'llm', async (job) => {
      const vars = job.variables as unknown as MaterialsProcessVariables
      const shortages = vars.inventoryCheck?.shortages || {}
      const fsLog = log.child({ worker: 'find-suppliers' })
      try {
        const supplierDecision = await findSuppliersAgent(shortages, vars.recipeId)
        const poId = generateId('PO')
        fsLog.info({ batchId: vars.batchId, supplier: supplierDecision.supplier, cost: supplierDecision.totalCost, lead: supplierDecision.leadTimeDays }, 'supplier found')
        return job.complete({
          supplierDecision,
          purchaseOrder: { poId, supplier: supplierDecision.supplier, totalCost: supplierDecision.totalCost, items: supplierDecision.items },
        } as any)
      } catch (err) {
        fsLog.error({ batchId: vars.batchId, err }, 'supplier search failed')
        throw err
      }
    }),
  })

  zeebe.createWorker({
    taskType: 'receive-materials',
    taskHandler: withTelemetry('materials', 'receive-materials', 'automation', (job) => {
      const vars = job.variables as unknown as MaterialsProcessVariables
      const items = vars.purchaseOrder?.items || vars.supplierDecision?.items || []
      receiveMaterials(items)
      const totalCost = vars.purchaseOrder?.totalCost || vars.supplierDecision?.totalCost || 0
      cogsTotal.add(totalCost, { category: 'materials' })
      inventoryValue.record(totalCost, { type: 'raw' })
      log.child({ worker: 'receive-materials' }).info({ batchId: vars.batchId, items: items.length, cost: totalCost }, 'materials received')
      return job.complete({} as any)
    }),
  })

  log.info('4 workers registered: check-inventory, calculate-requirements, find-suppliers, receive-materials')
}
```

**Step 3: Replace `src/workers/distribution.ts`**

```typescript
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
```

**Step 4: Replace `src/workers/accounting.ts`**

```typescript
import { ZeebeGrpcClient } from '@camunda8/sdk/dist/zeebe'
import { recordRevenue } from '../automation/accounting/record-revenue'
import { recordMaterialsCost } from '../automation/accounting/record-materials-cost'
import { calculateBatchCost } from '../automation/accounting/calculate-batch-cost'
import { recordShippingCost } from '../automation/accounting/record-shipping-cost'
import { AccountingProcessVariables } from '../types/accounting-variables'
import { parkersKolsch } from '../recipes/parkers-kolsch'
import { withTelemetry } from '../telemetry/with-telemetry'
import { createWorkerLogger } from '../telemetry/logger'
import { cogsTotal, revenueTotal, cashBalance } from '../telemetry/metrics'

const log = createWorkerLogger('accounting', 'accounting')

export function registerAccountingWorkers(zeebe: ZeebeGrpcClient): void {
  zeebe.createWorker({
    taskType: 'record-revenue',
    taskHandler: withTelemetry('accounting', 'record-revenue', 'automation', (job) => {
      const vars = job.variables as unknown as AccountingProcessVariables
      const order = vars.order
      const pricePerCase = vars.amount || parkersKolsch.pricing.basePricePerCase
      const cases = order?.quantity || 1
      const orderId = vars.correlationId
      const recipeId = order?.recipeId || parkersKolsch.id
      const entry = recordRevenue(orderId, recipeId, cases, pricePerCase)
      revenueTotal.add(entry.amount, { recipe: recipeId })
      cashBalance.record(entry.amount)
      log.child({ worker: 'record-revenue' }).info({ orderId, amount: entry.amount, entryId: entry.entryId }, 'revenue recorded')
      return job.complete({ ledgerEntryId: entry.entryId } as any)
    }),
  })

  zeebe.createWorker({
    taskType: 'record-materials-cost',
    taskHandler: withTelemetry('accounting', 'record-materials-cost', 'automation', (job) => {
      const vars = job.variables as unknown as AccountingProcessVariables
      const totalCost = vars.purchase?.totalCost || vars.amount || 0
      const poId = vars.correlationId
      const entry = recordMaterialsCost(poId, totalCost)
      cogsTotal.add(entry.amount, { category: 'materials' })
      cashBalance.record(-entry.amount)
      log.child({ worker: 'record-materials-cost' }).info({ poId, amount: entry.amount, entryId: entry.entryId }, 'materials cost recorded')
      return job.complete({ ledgerEntryId: entry.entryId } as any)
    }),
  })

  zeebe.createWorker({
    taskType: 'calculate-batch-cost',
    taskHandler: withTelemetry('accounting', 'calculate-batch-cost', 'automation', (job) => {
      const vars = job.variables as unknown as AccountingProcessVariables
      const batchId = vars.correlationId
      const recipe = parkersKolsch
      const casesProduced = vars.amount ? Math.round(vars.amount) : 10
      const costSheet = calculateBatchCost(batchId, recipe, casesProduced)
      cogsTotal.add(costSheet.totalCost, { category: 'production' })
      log.child({ worker: 'calculate-batch-cost' }).info({ batchId, totalCost: costSheet.totalCost, costPerCase: costSheet.costPerCase }, 'batch cost calculated')
      return job.complete({ ledgerEntryId: costSheet.batchId } as any)
    }),
  })

  zeebe.createWorker({
    taskType: 'record-shipping-cost',
    taskHandler: withTelemetry('accounting', 'record-shipping-cost', 'automation', (job) => {
      const vars = job.variables as unknown as AccountingProcessVariables
      const shipmentId = vars.correlationId
      const cost = vars.delivery?.shippingCost || vars.amount || 150
      const entry = recordShippingCost(shipmentId, cost)
      cogsTotal.add(entry.amount, { category: 'shipping' })
      cashBalance.record(-entry.amount)
      log.child({ worker: 'record-shipping-cost' }).info({ shipmentId, amount: entry.amount, entryId: entry.entryId }, 'shipping cost recorded')
      return job.complete({ ledgerEntryId: entry.entryId } as any)
    }),
  })

  log.info('4 workers registered: record-revenue, record-materials-cost, calculate-batch-cost, record-shipping-cost')
}
```

**Step 5: Commit**

```bash
cd /tmp/factorio && git add src/workers/sales.ts src/workers/materials.ts src/workers/distribution.ts src/workers/accounting.ts
git commit -m "refactor: migrate Phase 2 workers to OTel + Pino"
```

---

### Task 9: Update Worker Entrypoint

**Files:**
- Modify: `src/workers/index.ts`

**Step 1: Replace entrypoint to use telemetry init instead of metrics server**

Replace `src/workers/index.ts`:

```typescript
import { initTelemetry } from '../telemetry'
import 'dotenv/config'

// Initialize OTel SDK BEFORE importing anything else that creates spans/metrics
initTelemetry()

import { Camunda8 } from '@camunda8/sdk'
import { registerBrewingWorkers } from './brewing'
import { registerBottlingWorkers } from './bottling'
import { registerCratingWorkers } from './crating'
import { registerSalesWorkers } from './sales'
import { registerMaterialsWorkers } from './materials'
import { registerDistributionWorkers } from './distribution'
import { registerAccountingWorkers } from './accounting'
import { logger } from '../telemetry/logger'

const camunda = new Camunda8()
const zeebe = camunda.getZeebeGrpcApiClient()

// Phase 1: Physical factory
registerBrewingWorkers(zeebe)
registerBottlingWorkers(zeebe)
registerCratingWorkers(zeebe)

// Phase 2: Business layer
registerSalesWorkers(zeebe)
registerMaterialsWorkers(zeebe)
registerDistributionWorkers(zeebe)
registerAccountingWorkers(zeebe)

logger.info({ processes: ['brewing', 'bottling', 'crating', 'sales', 'materials', 'distribution', 'accounting'], workerCount: 34 }, 'All workers registered. Awaiting jobs...')
```

**Step 2: Verify TypeScript compiles**

Run: `cd /tmp/factorio && npx tsc --noEmit 2>&1 | head -10`
Expected: Clean compile (0 errors)

**Step 3: Run all tests**

Run: `cd /tmp/factorio && npx jest --no-coverage 2>&1 | tail -10`
Expected: 103+ tests pass (the new withTelemetry test adds 4)

**Step 4: Commit**

```bash
cd /tmp/factorio && git add src/workers/index.ts
git commit -m "refactor: wire up OTel SDK in worker entrypoint"
```

---

### Task 10: Docker Infrastructure — OTel Collector, Loki, Tempo

**Files:**
- Create: `docker/otel-collector.yaml`
- Create: `docker/tempo.yaml`
- Create: `docker/loki.yaml`
- Modify: `docker/docker-compose.yaml`
- Modify: `docker/prometheus.yml`

**Step 1: Create OTel Collector config**

Create `docker/otel-collector.yaml`:

```yaml
receivers:
  otlp:
    protocols:
      grpc:
        endpoint: 0.0.0.0:4317
      http:
        endpoint: 0.0.0.0:4318

processors:
  batch:
    timeout: 5s
    send_batch_size: 1024

exporters:
  prometheus:
    endpoint: 0.0.0.0:8889
    resource_to_telemetry_conversion:
      enabled: true

  otlphttp/loki:
    endpoint: http://loki:3100/otlp

  otlp/tempo:
    endpoint: tempo:4317
    tls:
      insecure: true

service:
  pipelines:
    metrics:
      receivers: [otlp]
      processors: [batch]
      exporters: [prometheus]
    logs:
      receivers: [otlp]
      processors: [batch]
      exporters: [otlphttp/loki]
    traces:
      receivers: [otlp]
      processors: [batch]
      exporters: [otlp/tempo]
```

**Step 2: Create Tempo config**

Create `docker/tempo.yaml`:

```yaml
server:
  http_listen_port: 3200

distributor:
  receivers:
    otlp:
      protocols:
        grpc:
          endpoint: 0.0.0.0:4317

storage:
  trace:
    backend: local
    local:
      path: /var/tempo/traces
    wal:
      path: /var/tempo/wal
```

**Step 3: Create Loki config**

Create `docker/loki.yaml`:

```yaml
auth_enabled: false

server:
  http_listen_port: 3100

common:
  ring:
    kvstore:
      store: inmemory
    replication_factor: 1
  path_prefix: /loki

schema_config:
  configs:
    - from: "2024-01-01"
      store: tsdb
      object_store: filesystem
      schema: v13
      index:
        prefix: index_
        period: 24h

storage_config:
  filesystem:
    directory: /loki/chunks

limits_config:
  allow_structured_metadata: true
  volume_enabled: true
```

**Step 4: Add 3 containers to docker-compose.yaml**

Add the following services to `docker/docker-compose.yaml` (after the `grafana` service, before `volumes:`):

```yaml
  otel-collector:
    image: otel/opentelemetry-collector-contrib:0.117.0
    container_name: otel-collector
    ports:
      - "4317:4317"
      - "4318:4318"
      - "8889:8889"
    volumes:
      - ./otel-collector.yaml:/etc/otelcol-contrib/config.yaml:ro
    extra_hosts:
      - "host.docker.internal:host-gateway"
    restart: unless-stopped
    networks:
      - camunda
    depends_on:
      - loki
      - tempo

  loki:
    image: grafana/loki:3.4.2
    container_name: loki
    ports:
      - "3100:3100"
    volumes:
      - ./loki.yaml:/etc/loki/local-config.yaml:ro
      - loki-data:/loki
    command: -config.file=/etc/loki/local-config.yaml
    restart: unless-stopped
    networks:
      - camunda

  tempo:
    image: grafana/tempo:2.7.1
    container_name: tempo
    ports:
      - "3200:3200"
    volumes:
      - ./tempo.yaml:/etc/tempo/tempo.yaml:ro
      - tempo-data:/var/tempo
    command: -config.file=/etc/tempo/tempo.yaml
    restart: unless-stopped
    networks:
      - camunda
```

Also add to the `volumes:` section:

```yaml
  loki-data:
  tempo-data:
```

And update the `grafana` service `depends_on` to include `loki` and `tempo`:

```yaml
    depends_on:
      - prometheus
      - loki
      - tempo
```

**Step 5: Update Prometheus scrape config**

Replace `docker/prometheus.yml`:

```yaml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
  - job_name: "factorio-brewery"
    scrape_interval: 5s
    static_configs:
      - targets: ["otel-collector:8889"]

  - job_name: "camunda-orchestration"
    scrape_interval: 15s
    metrics_path: "/actuator/prometheus"
    static_configs:
      - targets: ["orchestration:9600"]
```

**Step 6: Commit**

```bash
cd /tmp/factorio && git add docker/otel-collector.yaml docker/tempo.yaml docker/loki.yaml docker/docker-compose.yaml docker/prometheus.yml
git commit -m "feat: add OTel Collector, Loki, and Tempo to Docker stack"
```

---

### Task 11: Grafana Datasources — Add Loki + Tempo

**Files:**
- Modify: `docker/grafana/provisioning/datasources/prometheus.yml`

**Step 1: Update datasources to include all 3 backends**

Replace `docker/grafana/provisioning/datasources/prometheus.yml`:

```yaml
apiVersion: 1

datasources:
  - name: Prometheus
    type: prometheus
    access: proxy
    url: http://prometheus:9090
    isDefault: true
    editable: false

  - name: Loki
    type: loki
    access: proxy
    url: http://loki:3100
    editable: false
    jsonData:
      derivedFields:
        - datasourceUid: tempo
          matcherRegex: '"trace_id":"(\w+)"'
          name: TraceID
          url: '$${__value.raw}'

  - name: Tempo
    type: tempo
    access: proxy
    uid: tempo
    url: http://tempo:3200
    editable: false
    jsonData:
      tracesToLogsV2:
        datasourceUid: loki
        filterByTraceID: true
      nodeGraph:
        enabled: true
      serviceMap:
        datasourceUid: prometheus
```

**Step 2: Commit**

```bash
cd /tmp/factorio && git add docker/grafana/provisioning/datasources/prometheus.yml
git commit -m "feat: add Loki and Tempo datasources to Grafana with cross-linking"
```

---

### Task 12: Grafana Dashboard 1 — Factory Overview

**Files:**
- Create: `docker/grafana/dashboards/factory-overview.json`

**Step 1: Create the Factory Overview dashboard**

Create `docker/grafana/dashboards/factory-overview.json` with a full Grafana dashboard JSON. This is a large file — the key panels are:

```json
{
  "annotations": { "list": [] },
  "editable": true,
  "fiscalYearStartMonth": 0,
  "graphTooltip": 1,
  "links": [],
  "panels": [
    {
      "title": "Worker Throughput (steps/min)",
      "type": "timeseries",
      "gridPos": { "h": 8, "w": 12, "x": 0, "y": 0 },
      "datasource": { "type": "prometheus", "uid": "prometheus" },
      "targets": [{
        "expr": "rate(factory_step_count_total[1m])",
        "legendFormat": "{{worker}}"
      }]
    },
    {
      "title": "Active Process Instances",
      "type": "gauge",
      "gridPos": { "h": 8, "w": 6, "x": 12, "y": 0 },
      "datasource": { "type": "prometheus", "uid": "prometheus" },
      "targets": [{
        "expr": "sum(factory_active_processes)"
      }]
    },
    {
      "title": "Error Rate",
      "type": "stat",
      "gridPos": { "h": 8, "w": 6, "x": 18, "y": 0 },
      "datasource": { "type": "prometheus", "uid": "prometheus" },
      "targets": [{
        "expr": "sum(rate(factory_step_count_total{type=\"llm\"}[5m])) > 0"
      }]
    },
    {
      "title": "Worker Duration Heatmap",
      "type": "heatmap",
      "gridPos": { "h": 8, "w": 24, "x": 0, "y": 8 },
      "datasource": { "type": "prometheus", "uid": "prometheus" },
      "targets": [{
        "expr": "sum(rate(factory_worker_duration_seconds_bucket[5m])) by (le, worker)",
        "format": "heatmap"
      }]
    },
    {
      "title": "Worker Latency P95",
      "type": "timeseries",
      "gridPos": { "h": 8, "w": 12, "x": 0, "y": 16 },
      "datasource": { "type": "prometheus", "uid": "prometheus" },
      "targets": [{
        "expr": "histogram_quantile(0.95, rate(factory_worker_duration_seconds_bucket[5m]))",
        "legendFormat": "{{worker}} p95"
      }]
    },
    {
      "title": "Recent Logs",
      "type": "logs",
      "gridPos": { "h": 8, "w": 12, "x": 12, "y": 16 },
      "datasource": { "type": "loki", "uid": "loki" },
      "targets": [{
        "expr": "{service_name=\"factorio-brewery\"} | json",
        "refId": "A"
      }]
    },
    {
      "title": "Recent Traces",
      "type": "table",
      "gridPos": { "h": 8, "w": 24, "x": 0, "y": 24 },
      "datasource": { "type": "tempo", "uid": "tempo" },
      "targets": [{
        "queryType": "traceqlSearch",
        "filters": [{ "id": "service-name", "tag": "service.name", "operator": "=", "value": ["factorio-brewery"] }]
      }]
    }
  ],
  "schemaVersion": 39,
  "tags": ["factorio"],
  "templating": {
    "list": [{
      "name": "process",
      "type": "custom",
      "query": "brewing,bottling,crating,sales,materials,distribution,accounting",
      "current": { "text": "All", "value": "$__all" },
      "includeAll": true
    }]
  },
  "time": { "from": "now-15m", "to": "now" },
  "title": "FACTORIO — Factory Overview",
  "uid": "factorio-overview"
}
```

NOTE: The implementer should create a complete, valid Grafana dashboard JSON with all panels fully specified (including field overrides, thresholds, colors). The above is a skeleton — flesh it out into a complete dashboard.

**Step 2: Commit**

```bash
cd /tmp/factorio && git add docker/grafana/dashboards/factory-overview.json
git commit -m "feat: add Factory Overview Grafana dashboard"
```

---

### Task 13: Grafana Dashboard 2 — LLM Performance

**Files:**
- Create: `docker/grafana/dashboards/llm-performance.json`

**Step 1: Create LLM Performance dashboard**

Key panels:

- **LLM Call Latency** — `histogram_quantile(0.95, rate(factory_worker_duration_seconds_bucket{type="llm"}[5m]))` by worker
- **LLM Calls/min** — `rate(factory_step_count_total{type="llm"}[1m])` by worker
- **LLM Success Rate** — panel showing successful completions vs errors
- **LLM Error Logs** — Loki panel: `{service_name="factorio-brewery"} | json | factory_worker_type="llm" | level="error"`
- **LLM Traces** — Tempo search filtered to `factory.worker_type = llm`

Dashboard uid: `factorio-llm`, title: `FACTORIO — LLM Performance`

**Step 2: Commit**

```bash
cd /tmp/factorio && git add docker/grafana/dashboards/llm-performance.json
git commit -m "feat: add LLM Performance Grafana dashboard"
```

---

### Task 14: Grafana Dashboard 3 — Business Metrics

**Files:**
- Create: `docker/grafana/dashboards/business-metrics.json`

**Step 1: Create Business Metrics dashboard**

Key panels:

- **Orders/min** — `rate(factory_orders_total[1m])` by fulfillment status
- **Revenue** — `factory_revenue_total` by recipe
- **Fulfillment Rate** — percentage of FULFILL vs BACKORDER orders
- **COGS Breakdown** — `factory_cogs_total` by category (materials, production, shipping)
- **Cash Balance** — `factory_cash_balance` gauge
- **Inventory Values** — `factory_inventory_value` by type
- **Deliveries** — `factory_deliveries_total` by status
- **Bottles Produced** — `factory_bottles_produced_total`
- **Batch Pipeline** — `factory_batches_total` by status (lagered, qc-passed, qc-failed)

Dashboard uid: `factorio-business`, title: `FACTORIO — Business Metrics`

**Step 2: Commit**

```bash
cd /tmp/factorio && git add docker/grafana/dashboards/business-metrics.json
git commit -m "feat: add Business Metrics Grafana dashboard"
```

---

### Task 15: Integration Verification

**Files:** None (verification only)

**Step 1: Verify TypeScript compiles**

Run: `cd /tmp/factorio && npx tsc --noEmit 2>&1 | head -5`
Expected: Clean compile

**Step 2: Run all tests**

Run: `cd /tmp/factorio && npx jest --no-coverage 2>&1 | tail -10`
Expected: 107+ tests pass (103 existing + 4 new withTelemetry tests)

**Step 3: Verify Docker stack starts**

Run:
```bash
cd /tmp/factorio && docker compose -f docker/docker-compose.yaml up -d 2>&1
```

Wait 30 seconds, then verify containers:
```bash
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
```

Expected containers: orchestration, elasticsearch, connectors, prometheus, grafana, otel-collector, loki, tempo

**Step 4: Verify OTel Collector is receiving**

Run: `curl -s http://localhost:8889/metrics | head -5`
Expected: Prometheus metrics text format

**Step 5: Verify Grafana datasources**

Open: `http://localhost:3000/api/datasources` (admin/admin)
Expected: 3 datasources (Prometheus, Loki, Tempo)

**Step 6: Start workers and verify telemetry flows**

Run: `cd /tmp/factorio && npx ts-node src/workers/index.ts`

Wait for sales timer to fire, then check:
- Grafana → Explore → Loki: `{service_name="factorio-brewery"}` shows JSON logs
- Grafana → Explore → Tempo: traces appear with `factorio-brewery` service
- Grafana → Explore → Prometheus: `factory_step_count_total` has data

**Step 7: Verify dashboards load**

Open: `http://localhost:3000/dashboards`
Expected: 3 dashboards (Factory Overview, LLM Performance, Business Metrics)

**Step 8: Commit final state**

```bash
cd /tmp/factorio && git add -A
git commit -m "feat: complete observability stack — OTel SDK, Loki, Tempo, 3 Grafana dashboards"
```
