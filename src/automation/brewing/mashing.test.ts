import { simulateMash } from './mashing'
import { parkersKolsch } from '../../recipes/parkers-kolsch'

describe('simulateMash', () => {
  it('returns a MashResult', () => {
    const result = simulateMash(parkersKolsch)
    expect(result).toHaveProperty('mashTemp')
    expect(result).toHaveProperty('duration')
    expect(result).toHaveProperty('wortComposition')
  })

  it('mash temp is close to recipe target (±3°F)', () => {
    const result = simulateMash(parkersKolsch)
    expect(result.mashTemp).toBeGreaterThanOrEqual(parkersKolsch.process.mashTemp - 3)
    expect(result.mashTemp).toBeLessThanOrEqual(parkersKolsch.process.mashTemp + 3)
  })

  it('wort volume is greater than 0', () => {
    const result = simulateMash(parkersKolsch)
    expect(result.wortComposition.volume).toBeGreaterThan(0)
  })

  it('gravity is within expected range for the grain bill', () => {
    const result = simulateMash(parkersKolsch)
    // For 9 lbs pilsner malt, expect pre-boil gravity roughly 1.030-1.070
    expect(result.wortComposition.gravity).toBeGreaterThan(1.030)
    expect(result.wortComposition.gravity).toBeLessThan(1.120)
  })

  it('pH is in reasonable mash range (5.0-5.8)', () => {
    const result = simulateMash(parkersKolsch)
    expect(result.wortComposition.ph).toBeGreaterThanOrEqual(5.0)
    expect(result.wortComposition.ph).toBeLessThanOrEqual(5.8)
  })
})
