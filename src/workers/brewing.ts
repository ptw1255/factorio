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
