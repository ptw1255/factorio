import { ZeebeGrpcClient } from '@camunda8/sdk/dist/zeebe'
import { simulateMash } from '../automation/brewing/mashing'
import { simulateLauter } from '../automation/brewing/lautering'
import { simulateBoil } from '../automation/brewing/boiling'
import { simulateCooling } from '../automation/brewing/cooling'
import { initFermentation, checkFermentation } from '../automation/brewing/fermentation'
import { checkLagering } from '../automation/brewing/lagering'
import { batchQCAgent } from '../agents/batch-qc'
import { BrewingProcessVariables } from '../types/brewing-variables'
import { workerDuration, stepCount, batchesTotal } from '../metrics/index'

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

export function registerBrewingWorkers(zeebe: ZeebeGrpcClient): void {
  // 1. Mashing
  zeebe.createWorker({
    taskType: 'mashing',
    taskHandler: withMetrics('mashing', 'automation', (job) => {
      const vars = job.variables as unknown as BrewingProcessVariables
      const mashResult = simulateMash(vars.recipe)
      console.log(`[mashing] ✓ batch=${vars.batchId} temp=${mashResult.mashTemp}°F gravity=${mashResult.wortComposition.gravity}`)
      return job.complete({ mashResult } as any)
    }),
  })

  // 2. Lautering
  zeebe.createWorker({
    taskType: 'lautering',
    taskHandler: withMetrics('lautering', 'automation', (job) => {
      const vars = job.variables as unknown as BrewingProcessVariables
      const lauterResult = simulateLauter(vars.mashResult!, vars.recipe)
      console.log(`[lautering] ✓ batch=${vars.batchId} volume=${lauterResult.wortVolume}gal efficiency=${lauterResult.efficiency}%`)
      return job.complete({ lauterResult } as any)
    }),
  })

  // 3. Boil & Hop Additions
  zeebe.createWorker({
    taskType: 'boil-hop-addition',
    taskHandler: withMetrics('boil-hop-addition', 'automation', (job) => {
      const vars = job.variables as unknown as BrewingProcessVariables
      const boilResult = simulateBoil(vars.lauterResult!, vars.recipe)
      console.log(`[boil-hop-addition] ✓ batch=${vars.batchId} IBU=${boilResult.totalIBU} postVol=${boilResult.postBoilVolume}gal`)
      return job.complete({ boilResult } as any)
    }),
  })

  // 4. Cooling
  zeebe.createWorker({
    taskType: 'cooling',
    taskHandler: withMetrics('cooling', 'automation', (job) => {
      const vars = job.variables as unknown as BrewingProcessVariables
      const coolingResult = simulateCooling(vars.boilResult!, vars.recipe)
      console.log(`[cooling] ✓ batch=${vars.batchId} ${coolingResult.startTemp}°F → ${coolingResult.endTemp}°F in ${coolingResult.coolingDuration}min`)
      return job.complete({ coolingResult } as any)
    }),
  })

  // 5. Fermentation Check
  zeebe.createWorker({
    taskType: 'fermentation-check',
    taskHandler: withMetrics('fermentation-check', 'automation', (job) => {
      const vars = job.variables as unknown as BrewingProcessVariables

      let fermentationState
      if (!vars.fermentationState) {
        // First check — initialize from OG
        const ogReading = vars.boilResult
          ? 1 + (vars.mashResult?.wortComposition.gravity || 1.048) - 1
          : vars.recipe.process.targetOG
        fermentationState = initFermentation(vars.recipe, ogReading)
      } else {
        fermentationState = checkFermentation(vars.fermentationState, vars.recipe)
      }

      console.log(`[fermentation-check] ✓ batch=${vars.batchId} day=${fermentationState.day} gravity=${fermentationState.currentGravity} attenuation=${fermentationState.attenuation}% stuck=${fermentationState.stuck}`)

      return job.complete({ fermentationState } as any)
    }),
  })

  // 6. Lagering Complete
  zeebe.createWorker({
    taskType: 'lagering-complete',
    taskHandler: withMetrics('lagering-complete', 'automation', (job) => {
      const vars = job.variables as unknown as BrewingProcessVariables
      const targetDays = vars.recipe.process.lageringDays ?? 28
      const lageringResult = checkLagering(vars.recipe, targetDays)

      // Calculate final values
      const og = vars.fermentationState?.gravityReadings[0]?.value ?? vars.recipe.process.targetOG
      const fg = vars.fermentationState?.currentGravity ?? vars.recipe.process.targetFG
      const finalABV = Math.round((og - fg) * 131.25 * 10) / 10
      const finalGravity = fg
      const finalVolume = vars.boilResult?.postBoilVolume ?? 5

      console.log(`[lagering-complete] ✓ batch=${vars.batchId} clarity=${lageringResult.clarityScore}/10 ABV=${finalABV}%`)
      batchesTotal.inc({ recipe: vars.recipeId, status: 'lagered' })

      return job.complete({ lageringResult, finalABV, finalGravity, finalVolume } as any)
    }),
  })

  // 7. Batch QC (LLM)
  zeebe.createWorker({
    taskType: 'batch-qc',
    timeout: 60000,
    taskHandler: withMetrics('batch-qc', 'llm', async (job) => {
      const vars = job.variables as unknown as BrewingProcessVariables
      try {
        const batchQC = await batchQCAgent(vars, vars.recipe)
        console.log(`[batch-qc] ✓ batch=${vars.batchId} score=${batchQC.qualityScore} passed=${batchQC.passed}`)
        batchesTotal.inc({ recipe: vars.recipeId, status: batchQC.passed ? 'qc-passed' : 'qc-failed' })
        return job.complete({ batchQC } as any)
      } catch (err) {
        console.error(`[batch-qc] ✗ batch=${vars.batchId} error:`, err)
        throw err
      }
    }),
  })

  console.log('[brewing] 7 workers registered: mashing, lautering, boil-hop-addition, cooling, fermentation-check, lagering-complete, batch-qc')
}
