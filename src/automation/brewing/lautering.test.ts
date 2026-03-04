import { simulateLauter } from './lautering'
import { simulateMash } from './mashing'
import { parkersKolsch } from '../../recipes/parkers-kolsch'

describe('simulateLauter', () => {
  const mashResult = simulateMash(parkersKolsch)

  it('returns a LauterResult', () => {
    const result = simulateLauter(mashResult, parkersKolsch)
    expect(result).toHaveProperty('wortVolume')
    expect(result).toHaveProperty('efficiency')
    expect(result).toHaveProperty('spargeWater')
  })

  it('wort volume is positive and reasonable', () => {
    const result = simulateLauter(mashResult, parkersKolsch)
    expect(result.wortVolume).toBeGreaterThan(0)
    // Should not exceed total water added
    const totalWater = mashResult.wortComposition.volume + result.spargeWater
    expect(result.wortVolume).toBeLessThanOrEqual(totalWater)
  })

  it('efficiency is between 60-85%', () => {
    const result = simulateLauter(mashResult, parkersKolsch)
    expect(result.efficiency).toBeGreaterThanOrEqual(60)
    expect(result.efficiency).toBeLessThanOrEqual(85)
  })

  it('sparge water is positive', () => {
    const result = simulateLauter(mashResult, parkersKolsch)
    expect(result.spargeWater).toBeGreaterThan(0)
  })
})
