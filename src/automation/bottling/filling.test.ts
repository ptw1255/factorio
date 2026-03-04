import { simulateFilling } from './filling'
import { VolumeReading } from '../../types/bottling-variables'

describe('simulateFilling', () => {
  const volumeReading: VolumeReading = {
    batchId: 'BATCH-001',
    tankVolume: 5,
    bottleSize: 12,
    estimatedBottles: 53,
    estimatedCases: 2,
  }

  it('returns a FillingResult', () => {
    const result = simulateFilling(volumeReading)
    expect(result).toHaveProperty('bottlesFilled')
    expect(result).toHaveProperty('bottlesBroken')
    expect(result).toHaveProperty('fillRate')
    expect(result).toHaveProperty('wastePercentage')
  })

  it('bottles filled = estimated - broken', () => {
    const result = simulateFilling(volumeReading)
    expect(result.bottlesFilled + result.bottlesBroken).toBe(volumeReading.estimatedBottles)
  })

  it('broken is roughly 1.5-2.5%', () => {
    // Run multiple times
    const rates: number[] = []
    for (let i = 0; i < 20; i++) {
      const result = simulateFilling(volumeReading)
      rates.push(result.wastePercentage)
    }
    const avg = rates.reduce((a, b) => a + b, 0) / rates.length
    expect(avg).toBeGreaterThanOrEqual(1.0)
    expect(avg).toBeLessThanOrEqual(3.0)
  })

  it('fill rate is 30-60 bottles/min', () => {
    const result = simulateFilling(volumeReading)
    expect(result.fillRate).toBeGreaterThanOrEqual(30)
    expect(result.fillRate).toBeLessThanOrEqual(60)
  })
})
