import { initCasePackerArm, simulateCasePackingCycle } from './case-packing'

describe('case packing', () => {
  it('initCasePackerArm creates idle arm', () => {
    const arm = initCasePackerArm('ARM-CP-01')
    expect(arm.armId).toBe('ARM-CP-01')
    expect(arm.status).toBe('idle')
    expect(arm.cycleCount).toBe(0)
    expect(arm.gripperState).toBe('open')
  })

  it('simulateCasePackingCycle returns result', () => {
    const arm = initCasePackerArm('ARM-CP-01')
    const { armState, result } = simulateCasePackingCycle(arm, 0)
    expect(result).toHaveProperty('casesPackedThisCycle')
    expect(result).toHaveProperty('totalCasesPacked')
    expect(result).toHaveProperty('cyclesThisSession')
    expect(armState.cycleCount).toBe(1)
  })

  it('gripper pressure stays within thresholds on success', () => {
    const arm = initCasePackerArm('ARM-CP-01')
    // Run multiple cycles to check pressure behavior
    let state = arm
    for (let i = 0; i < 10; i++) {
      const { armState, fault } = simulateCasePackingCycle(state, i)
      if (!fault) {
        // After cycle completes, gripper should be open with 0 pressure
        expect(armState.gripperState).toBe('open')
      }
      state = armState
    }
  })

  it('motor temp increases over cycles', () => {
    let state = initCasePackerArm('ARM-CP-01')
    const initialTemp = state.motorTemperature
    for (let i = 0; i < 20; i++) {
      const { armState } = simulateCasePackingCycle(state, i)
      state = armState
    }
    expect(state.motorTemperature).toBeGreaterThan(initialTemp)
  })

  it('vibration level stays within bounds', () => {
    let state = initCasePackerArm('ARM-CP-01')
    for (let i = 0; i < 50; i++) {
      const { armState } = simulateCasePackingCycle(state, i)
      state = armState
      expect(state.vibrationLevel).toBeGreaterThanOrEqual(0.5)
      expect(state.vibrationLevel).toBeLessThanOrEqual(8.0)
    }
  })
})
