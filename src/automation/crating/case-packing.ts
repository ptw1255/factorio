import { RoboticArmTelemetry, ArmFault } from '../../types/telemetry'
import { CasePackingResult } from '../../types/crating-variables'

/**
 * Initialize a robotic arm for case packing.
 */
export function initCasePackerArm(armId: string): RoboticArmTelemetry {
  return {
    armId,
    status: 'idle',
    joints: { shoulder: 0, elbow: 90, wrist: 0, extension: 0 },
    velocity: 0,
    targetPosition: { x: 0, y: 0, z: 500 },
    currentPosition: { x: 0, y: 0, z: 500 },
    positionError: 0,
    gripperState: 'open',
    gripperPressure: 0,
    gripperPressureMin: 15,
    gripperPressureMax: 45,
    motorTemperature: 35,
    vibrationLevel: 1.0,
    cycleCount: 0,
    cyclesSinceLastMaintenance: 0,
    bearingWearIndex: 0,
    faultHistory: [],
    meanTimeBetweenFailures: 5000,
  }
}

/**
 * Simulate one case packing cycle: IDLE → PICKING → PLACING → SEALING → IDLE
 */
export function simulateCasePackingCycle(
  armState: RoboticArmTelemetry,
  totalCasesPacked: number
): { armState: RoboticArmTelemetry; result: CasePackingResult; fault?: ArmFault } {
  const newState = { ...armState }
  let fault: ArmFault | undefined

  // State machine: picking
  newState.status = 'picking'
  newState.gripperState = 'closing'
  newState.gripperPressure = newState.gripperPressureMin + Math.random() * (newState.gripperPressureMax - newState.gripperPressureMin)

  // Fault: grip lost (~1% chance)
  if (Math.random() < 0.01) {
    newState.gripperPressure = newState.gripperPressureMin * 0.5
    newState.status = 'fault'
    fault = {
      faultCode: 'GRIP_LOST',
      severity: 'error',
      timestamp: new Date().toISOString(),
      jointPositions: { ...newState.joints },
      recoveryAction: 'Re-home and retry',
      resolved: false,
    }
    newState.faultHistory = [...newState.faultHistory, fault]
  } else {
    newState.gripperState = 'closed'

    // State: placing
    newState.status = 'placing'

    // State: sealing
    newState.status = 'sealing'

    // Complete cycle
    newState.status = 'idle'
    newState.gripperState = 'open'
    newState.gripperPressure = 0
  }

  // Motor temp increases slightly per cycle
  newState.motorTemperature += 0.1 + Math.random() * 0.2

  // Fault: overtemp (~0.5% chance)
  if (newState.motorTemperature > 75 || Math.random() < 0.005) {
    fault = {
      faultCode: 'OVER_TEMP',
      severity: 'warning',
      timestamp: new Date().toISOString(),
      jointPositions: { ...newState.joints },
      recoveryAction: 'Cool-down timer',
      resolved: false,
    }
    newState.faultHistory = [...newState.faultHistory, fault]
    newState.status = 'fault'
  }

  // Vibration random walk
  newState.vibrationLevel += (Math.random() - 0.5) * 0.3
  newState.vibrationLevel = Math.max(0.5, Math.min(8.0, newState.vibrationLevel))

  // Bearing wear
  newState.cycleCount++
  newState.cyclesSinceLastMaintenance++
  newState.bearingWearIndex = newState.cyclesSinceLastMaintenance / newState.meanTimeBetweenFailures

  const casesPackedThisCycle = fault ? 0 : 1

  return {
    armState: newState,
    result: {
      casesPackedThisCycle,
      totalCasesPacked: totalCasesPacked + casesPackedThisCycle,
      armState: newState,
      cyclesThisSession: newState.cycleCount,
      faultsThisSession: newState.faultHistory.length,
    },
    fault,
  }
}
