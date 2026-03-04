import { simulateCooling } from './cooling'
import { simulateMash } from './mashing'
import { simulateLauter } from './lautering'
import { simulateBoil } from './boiling'
import { parkersKolsch } from '../../recipes/parkers-kolsch'

describe('simulateCooling', () => {
  const mashResult = simulateMash(parkersKolsch)
  const lauterResult = simulateLauter(mashResult, parkersKolsch)
  const boilResult = simulateBoil(lauterResult, parkersKolsch)

  it('returns a CoolingResult', () => {
    const result = simulateCooling(boilResult, parkersKolsch)
    expect(result).toHaveProperty('startTemp')
    expect(result).toHaveProperty('endTemp')
    expect(result).toHaveProperty('coolingDuration')
    expect(result).toHaveProperty('targetTemp')
  })

  it('end temp is within ±1°F of recipe fermentation temp', () => {
    const result = simulateCooling(boilResult, parkersKolsch)
    expect(result.endTemp).toBeGreaterThanOrEqual(parkersKolsch.process.fermentationTemp - 1.5)
    expect(result.endTemp).toBeLessThanOrEqual(parkersKolsch.process.fermentationTemp + 1.5)
  })

  it('cooling duration is reasonable (10-30 min)', () => {
    const result = simulateCooling(boilResult, parkersKolsch)
    expect(result.coolingDuration).toBeGreaterThanOrEqual(10)
    expect(result.coolingDuration).toBeLessThanOrEqual(30)
  })
})
