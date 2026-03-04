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
