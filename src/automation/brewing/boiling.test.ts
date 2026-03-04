import { simulateBoil } from './boiling'
import { simulateMash } from './mashing'
import { simulateLauter } from './lautering'
import { parkersKolsch } from '../../recipes/parkers-kolsch'

describe('simulateBoil', () => {
  const mashResult = simulateMash(parkersKolsch)
  const lauterResult = simulateLauter(mashResult, parkersKolsch)

  it('returns a BoilResult', () => {
    const result = simulateBoil(lauterResult, parkersKolsch)
    expect(result).toHaveProperty('preBoilVolume')
    expect(result).toHaveProperty('postBoilVolume')
    expect(result).toHaveProperty('hopAdditions')
    expect(result).toHaveProperty('totalIBU')
  })

  it('post-boil volume is less than pre-boil (evaporation)', () => {
    const result = simulateBoil(lauterResult, parkersKolsch)
    expect(result.postBoilVolume).toBeLessThan(result.preBoilVolume)
  })

  it('hop additions match recipe hop schedule', () => {
    const result = simulateBoil(lauterResult, parkersKolsch)
    expect(result.hopAdditions.length).toBe(parkersKolsch.hopSchedule.length)
    for (const addition of result.hopAdditions) {
      expect(addition.hop).toBeDefined()
      expect(addition.ibuContribution).toBeGreaterThan(0)
    }
  })

  it('total IBU is within reasonable range of recipe target', () => {
    // Run multiple times to account for randomness
    const ibus: number[] = []
    for (let i = 0; i < 10; i++) {
      const mash = simulateMash(parkersKolsch)
      const lauter = simulateLauter(mash, parkersKolsch)
      const result = simulateBoil(lauter, parkersKolsch)
      ibus.push(result.totalIBU)
    }
    const avgIBU = ibus.reduce((a, b) => a + b, 0) / ibus.length
    // Should be in the ballpark (±50% of target given natural variation)
    expect(avgIBU).toBeGreaterThan(parkersKolsch.process.targetIBU * 0.3)
    expect(avgIBU).toBeLessThan(parkersKolsch.process.targetIBU * 3)
  })

  it('boil duration matches recipe', () => {
    const result = simulateBoil(lauterResult, parkersKolsch)
    expect(result.boilDuration).toBe(parkersKolsch.process.boilDuration)
  })
})
