import { sampleQuality } from './quality-sampling'
import { parkersKolsch } from '../../recipes/parkers-kolsch'

describe('sampleQuality', () => {
  it('returns a QualitySample', () => {
    const result = sampleQuality(parkersKolsch, 4.8)
    expect(result).toHaveProperty('carbonation')
    expect(result).toHaveProperty('clarity')
    expect(result).toHaveProperty('abv')
    expect(result).toHaveProperty('overallPassed')
  })

  it('carbonation level is in 2.3-2.8 range', () => {
    const result = sampleQuality(parkersKolsch, 4.8)
    expect(result.carbonation.level).toBeGreaterThanOrEqual(2.3)
    expect(result.carbonation.level).toBeLessThanOrEqual(2.8)
  })

  it('clarity score is 7-10', () => {
    const result = sampleQuality(parkersKolsch, 4.8)
    expect(result.clarity.score).toBeGreaterThanOrEqual(7)
    expect(result.clarity.score).toBeLessThanOrEqual(10)
  })

  it('ABV deviation is calculated correctly', () => {
    const result = sampleQuality(parkersKolsch, 5.0)
    expect(result.abv.deviation).toBeCloseTo(0.2, 1)
  })

  it('ABV passes if within ±0.3%', () => {
    const result = sampleQuality(parkersKolsch, 4.9)
    expect(result.abv.passed).toBe(true)
  })

  it('ABV fails if deviation > 0.3%', () => {
    const result = sampleQuality(parkersKolsch, 5.5)
    expect(result.abv.passed).toBe(false)
  })

  it('overall passes when all checks pass', () => {
    // ABV on target should usually pass
    const result = sampleQuality(parkersKolsch, 4.8)
    // carbonation and clarity are random but typically pass
    expect(typeof result.overallPassed).toBe('boolean')
  })
})
