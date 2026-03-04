import { ZeebeGrpcClient } from '@camunda8/sdk/dist/zeebe'
import { calculateVolume } from '../automation/bottling/volume-reading'
import { simulateFilling } from '../automation/bottling/filling'
import { sampleQuality } from '../automation/bottling/quality-sampling'
import { labelGenerationAgent } from '../agents/label-generation'
import { BottlingProcessVariables } from '../types/bottling-variables'
import { workerDuration, stepCount, bottlesProduced, bottlesRejected } from '../metrics/index'

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

export function registerBottlingWorkers(zeebe: ZeebeGrpcClient): void {
  // 1. Volume Reading
  zeebe.createWorker({
    taskType: 'volume-reading',
    taskHandler: withMetrics('volume-reading', 'automation', (job) => {
      const vars = job.variables as unknown as BottlingProcessVariables
      const tankVolume = (vars as any).finalVolume || 5
      const volumeReading = calculateVolume(vars.batchId, tankVolume, vars.recipe)
      console.log(`[volume-reading] ✓ batch=${vars.batchId} bottles=${volumeReading.estimatedBottles} cases=${volumeReading.estimatedCases}`)
      return job.complete({ volumeReading } as any)
    }),
  })

  // 2. Label Generation (LLM)
  zeebe.createWorker({
    taskType: 'label-generation',
    timeout: 60000,
    taskHandler: withMetrics('label-generation', 'llm', async (job) => {
      const vars = job.variables as unknown as BottlingProcessVariables
      try {
        const labelData = await labelGenerationAgent(
          vars.batchId,
          vars.recipe,
          vars.qualityScore || 85,
          vars.tastingNotes || 'Clean, crisp, well-balanced'
        )
        console.log(`[label-generation] ✓ batch=${vars.batchId} product="${labelData.productName}"`)
        return job.complete({ labelData } as any)
      } catch (err) {
        console.error(`[label-generation] ✗ batch=${vars.batchId} error:`, err)
        throw err
      }
    }),
  })

  // 3. Filling Simulation
  zeebe.createWorker({
    taskType: 'filling-simulation',
    taskHandler: withMetrics('filling-simulation', 'automation', (job) => {
      const vars = job.variables as unknown as BottlingProcessVariables
      const fillingResult = simulateFilling(vars.volumeReading!)
      bottlesProduced.inc({ recipe: vars.recipeId }, fillingResult.bottlesFilled)
      bottlesRejected.inc({ recipe: vars.recipeId, reason: 'breakage' }, fillingResult.bottlesBroken)
      console.log(`[filling-simulation] ✓ batch=${vars.batchId} filled=${fillingResult.bottlesFilled} broken=${fillingResult.bottlesBroken}`)
      return job.complete({ fillingResult } as any)
    }),
  })

  // 4. Quality Sampling
  zeebe.createWorker({
    taskType: 'quality-sampling',
    taskHandler: withMetrics('quality-sampling', 'automation', (job) => {
      const vars = job.variables as unknown as BottlingProcessVariables
      const actualABV = (vars as any).finalABV || vars.recipe.process.targetABV
      const qualitySample = sampleQuality(vars.recipe, actualABV)
      console.log(`[quality-sampling] ✓ batch=${vars.batchId} passed=${qualitySample.overallPassed} carbonation=${qualitySample.carbonation.level} clarity=${qualitySample.clarity.score}`)
      return job.complete({ qualitySample } as any)
    }),
  })

  console.log('[bottling] 4 workers registered: volume-reading, label-generation, filling-simulation, quality-sampling')
}
