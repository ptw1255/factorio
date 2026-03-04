import { simulatePalletizing } from './palletizing'
import { parkersKolsch } from '../../recipes/parkers-kolsch'

describe('simulatePalletizing', () => {
  it('returns a PalletBuildResult', () => {
    const result = simulatePalletizing(24, parkersKolsch)
    expect(result).toHaveProperty('palletId')
    expect(result).toHaveProperty('layers')
    expect(result).toHaveProperty('casesPerLayer')
    expect(result).toHaveProperty('totalCases')
    expect(result).toHaveProperty('totalWeight')
    expect(result).toHaveProperty('stable')
    expect(result).toHaveProperty('weightDistribution')
  })

  it('calculates layers correctly', () => {
    const result = simulatePalletizing(12, parkersKolsch)
    expect(result.casesPerLayer).toBe(6)
    expect(result.layers).toBe(2)
    expect(result.totalCases).toBe(12)
  })

  it('weight accumulates per case', () => {
    const result = simulatePalletizing(6, parkersKolsch)
    expect(result.totalWeight).toBe(6 * 30) // 30 lbs per case
  })

  it('weight distribution sums to total', () => {
    const result = simulatePalletizing(24, parkersKolsch)
    expect(result.weightDistribution.center + result.weightDistribution.edge).toBeCloseTo(result.totalWeight, -1)
  })

  it('stability is a boolean', () => {
    const result = simulatePalletizing(24, parkersKolsch)
    expect(typeof result.stable).toBe('boolean')
  })
})
