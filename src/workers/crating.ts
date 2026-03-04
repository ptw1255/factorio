import { ZeebeGrpcClient } from '@camunda8/sdk/dist/zeebe'
import { inspectBottleBatch } from '../automation/crating/inspection'
import { initCasePackerArm, simulateCasePackingCycle } from '../automation/crating/case-packing'
import { simulatePalletizing } from '../automation/crating/palletizing'
import { initConveyor, checkConveyorHealth } from '../automation/crating/conveyor-health'
import { visionReviewAgent } from '../agents/vision-review'
import { predictiveMaintenanceAgent } from '../agents/predictive-maintenance'
import { CratingProcessVariables } from '../types/crating-variables'
import { workerDuration, stepCount, armCycles, armFaults, bottlesRejected, conveyorEfficiency } from '../metrics/index'

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

export function registerCratingWorkers(zeebe: ZeebeGrpcClient): void {
  // 1. Line Initialize
  zeebe.createWorker({
    taskType: 'line-initialize',
    taskHandler: withMetrics('line-initialize', 'automation', (job) => {
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

      console.log(`[line-initialize] ✓ batch=${vars.batchId} 3 arms + 3 conveyors initialized`)
      return job.complete({ lineStatus } as any)
    }),
  })

  // 2. Bottle Inspection
  zeebe.createWorker({
    taskType: 'bottle-inspect',
    taskHandler: withMetrics('bottle-inspect', 'automation', (job) => {
      const vars = job.variables as unknown as CratingProcessVariables
      const batchSize = Math.min(vars.bottleCount || 24, 24)
      const inspectionResult = inspectBottleBatch(batchSize)

      bottlesRejected.inc({ recipe: vars.recipeId, reason: 'inspection' }, inspectionResult.rejected)
      console.log(`[bottle-inspect] ✓ batch=${vars.batchId} pass=${inspectionResult.passed} reject=${inspectionResult.rejected} review=${inspectionResult.review}`)
      return job.complete({ inspectionResult } as any)
    }),
  })

  // 3. Vision Review (LLM)
  zeebe.createWorker({
    taskType: 'vision-review',
    timeout: 60000,
    taskHandler: withMetrics('vision-review', 'llm', async (job) => {
      const vars = job.variables as unknown as CratingProcessVariables
      const reviewBottles = vars.inspectionResult?.inspections.filter(i => i.overallVerdict === 'review') || []

      const results = []
      for (const bottle of reviewBottles) {
        try {
          const review = await visionReviewAgent(bottle)
          results.push({ bottleId: bottle.bottleId, ...review })
        } catch (err) {
          console.error(`[vision-review] ✗ bottle=${bottle.bottleId} error:`, err)
          results.push({ bottleId: bottle.bottleId, finalVerdict: 'reject' as const, reasoning: 'LLM error — rejected for safety', confidence: 0 })
        }
      }

      const passed = results.filter(r => r.finalVerdict === 'pass').length
      const rejected = results.filter(r => r.finalVerdict === 'reject').length
      console.log(`[vision-review] ✓ batch=${vars.batchId} reviewed=${results.length} passed=${passed} rejected=${rejected}`)

      return job.complete({ visionReviewResults: results } as any)
    }),
  })

  // 4. Case Packer Cycle
  zeebe.createWorker({
    taskType: 'case-packer-cycle',
    taskHandler: withMetrics('case-packer-cycle', 'automation', (job) => {
      const vars = job.variables as unknown as CratingProcessVariables
      const armState = vars.lineStatus?.casePackerArm || initCasePackerArm('ARM-CP-01')
      const totalPacked = vars.casePackingResult?.totalCasesPacked || 0

      const { armState: newArmState, result, fault } = simulateCasePackingCycle(armState, totalPacked)

      armCycles.inc({ arm_id: newArmState.armId })
      if (fault) {
        armFaults.inc({ arm_id: newArmState.armId, fault_code: fault.faultCode })
      }

      console.log(`[case-packer-cycle] ✓ batch=${vars.batchId} packed=${result.totalCasesPacked} fault=${fault?.faultCode || 'none'}`)
      return job.complete({
        casePackingResult: result,
        casePackerFault: fault || null,
      } as any)
    }),
  })

  // 5. Arm Recovery
  zeebe.createWorker({
    taskType: 'arm-recovery',
    taskHandler: withMetrics('arm-recovery', 'automation', (job) => {
      const vars = job.variables as unknown as CratingProcessVariables
      const armState = vars.casePackingResult?.armState || initCasePackerArm('ARM-CP-01')

      // Recovery: re-home, reset faults, cool down
      const recoveredState = {
        ...armState,
        status: 'idle' as const,
        gripperState: 'open' as const,
        gripperPressure: 0,
        motorTemperature: Math.max(35, armState.motorTemperature - 10),
      }

      // Mark latest fault as resolved
      if (recoveredState.faultHistory.length > 0) {
        const latest = { ...recoveredState.faultHistory[recoveredState.faultHistory.length - 1], resolved: true }
        recoveredState.faultHistory = [...recoveredState.faultHistory.slice(0, -1), latest]
      }

      console.log(`[arm-recovery] ✓ batch=${vars.batchId} arm re-homed, temp=${recoveredState.motorTemperature}°C`)
      return job.complete({ casePackerFault: null } as any)
    }),
  })

  // 6. Palletizer Cycle
  zeebe.createWorker({
    taskType: 'palletizer-cycle',
    taskHandler: withMetrics('palletizer-cycle', 'automation', (job) => {
      const vars = job.variables as unknown as CratingProcessVariables
      const totalCases = vars.casePackingResult?.totalCasesPacked || 1
      const palletResult = simulatePalletizing(totalCases, vars.recipe)

      console.log(`[palletizer-cycle] ✓ batch=${vars.batchId} pallet=${palletResult.palletId} cases=${palletResult.totalCases} stable=${palletResult.stable}`)
      return job.complete({ palletResult } as any)
    }),
  })

  // 7. Pallet Wrap & Stage
  zeebe.createWorker({
    taskType: 'pallet-wrap-stage',
    taskHandler: withMetrics('pallet-wrap-stage', 'automation', (job) => {
      const vars = job.variables as unknown as CratingProcessVariables
      const palletId = vars.palletResult?.palletId || 'unknown'

      // Check conveyor health
      if (vars.lineStatus?.conveyorC) {
        const health = checkConveyorHealth(vars.lineStatus.conveyorC)
        conveyorEfficiency.set({ conveyor_id: health.conveyorId }, health.efficiency)
      }

      console.log(`[pallet-wrap-stage] ✓ batch=${vars.batchId} pallet=${palletId} wrapped and staged`)
      return job.complete({ palletWrapped: true } as any)
    }),
  })

  // 8. Predictive Maintenance (LLM)
  zeebe.createWorker({
    taskType: 'predictive-maintenance',
    timeout: 60000,
    taskHandler: withMetrics('predictive-maintenance', 'llm', async (job) => {
      const vars = job.variables as unknown as CratingProcessVariables
      const armToAnalyze = vars.casePackingResult?.armState || vars.lineStatus?.casePackerArm

      if (!armToAnalyze) {
        console.log(`[predictive-maintenance] ✓ batch=${vars.batchId} no telemetry to analyze`)
        return job.complete({ maintenancePrediction: null } as any)
      }

      try {
        const prediction = await predictiveMaintenanceAgent(armToAnalyze)
        console.log(`[predictive-maintenance] ✓ batch=${vars.batchId} urgency=${prediction.urgency} confidence=${prediction.confidence}`)
        return job.complete({
          maintenancePrediction: {
            armId: armToAnalyze.armId,
            ...prediction,
          },
        } as any)
      } catch (err) {
        console.error(`[predictive-maintenance] ✗ batch=${vars.batchId} error:`, err)
        return job.complete({ maintenancePrediction: null } as any)
      }
    }),
  })

  console.log('[crating] 8 workers registered: line-initialize, bottle-inspect, vision-review, case-packer-cycle, arm-recovery, palletizer-cycle, pallet-wrap-stage, predictive-maintenance')
}
