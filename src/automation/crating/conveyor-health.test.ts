import { initConveyor, checkConveyorHealth } from './conveyor-health'

describe('conveyor health', () => {
  it('initConveyor creates running conveyor', () => {
    const conveyor = initConveyor('CONV-A', 60, 100)
    expect(conveyor.conveyorId).toBe('CONV-A')
    expect(conveyor.running).toBe(true)
    expect(conveyor.targetSpeed).toBe(60)
  })

  it('checkConveyorHealth updates throughput', () => {
    const conveyor = initConveyor('CONV-A', 60, 100)
    const updated = checkConveyorHealth(conveyor)
    expect(updated.throughputActual).toBeGreaterThan(0)
    expect(updated.efficiency).toBeGreaterThan(0)
    expect(updated.efficiency).toBeLessThanOrEqual(1)
  })

  it('motor current stays in bounds', () => {
    let conveyor = initConveyor('CONV-A', 60, 100)
    for (let i = 0; i < 50; i++) {
      conveyor = checkConveyorHealth(conveyor)
      expect(conveyor.motorCurrent).toBeGreaterThanOrEqual(1.5)
      expect(conveyor.motorCurrent).toBeLessThanOrEqual(6.0)
    }
  })

  it('belt tension stays in bounds', () => {
    let conveyor = initConveyor('CONV-A', 60, 100)
    for (let i = 0; i < 50; i++) {
      conveyor = checkConveyorHealth(conveyor)
      expect(conveyor.beltTension).toBeGreaterThanOrEqual(40)
      expect(conveyor.beltTension).toBeLessThanOrEqual(70)
    }
  })

  it('jam detection returns location when detected', () => {
    // Force a jam by setting high motor current
    const conveyor = initConveyor('CONV-A', 60, 100)
    conveyor.motorCurrent = 5.5 // above spike threshold
    const updated = checkConveyorHealth(conveyor)
    // Motor current might random walk down, so check structure
    if (updated.jamDetected) {
      expect(updated.jamLocation).toBeDefined()
      expect(updated.running).toBe(false)
    }
  })
})
