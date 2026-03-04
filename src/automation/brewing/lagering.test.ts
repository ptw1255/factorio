import { checkLagering } from './lagering'
import { parkersKolsch } from '../../recipes/parkers-kolsch'

describe('checkLagering', () => {
  it('returns a LageringResult', () => {
    const result = checkLagering(parkersKolsch, 14)
    expect(result).toHaveProperty('daysCompleted')
    expect(result).toHaveProperty('targetDays')
    expect(result).toHaveProperty('temp')
    expect(result).toHaveProperty('clarityScore')
  })

  it('days completed tracks correctly', () => {
    const result = checkLagering(parkersKolsch, 7)
    expect(result.daysCompleted).toBe(7)
    expect(result.targetDays).toBe(28)
  })

  it('returns recipe lagering temp', () => {
    const result = checkLagering(parkersKolsch, 14)
    expect(result.temp).toBe(34)
  })

  it('clarity score improves over time', () => {
    const early = checkLagering(parkersKolsch, 7)
    const mid = checkLagering(parkersKolsch, 14)
    const late = checkLagering(parkersKolsch, 28)

    expect(mid.clarityScore).toBeGreaterThan(early.clarityScore)
    expect(late.clarityScore).toBeGreaterThan(mid.clarityScore)
  })

  it('clarity score maxes at 10', () => {
    const result = checkLagering(parkersKolsch, 100)
    expect(result.clarityScore).toBe(10)
  })
})
