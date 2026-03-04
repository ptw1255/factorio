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
