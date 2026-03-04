import { calculateVolume } from './volume-reading'
import { parkersKolsch } from '../../recipes/parkers-kolsch'

describe('calculateVolume', () => {
  it('returns a VolumeReading', () => {
    const result = calculateVolume('BATCH-001', 5, parkersKolsch)
    expect(result).toHaveProperty('batchId')
    expect(result).toHaveProperty('tankVolume')
    expect(result).toHaveProperty('estimatedBottles')
    expect(result).toHaveProperty('estimatedCases')
  })

  it('bottle count = floor(tank oz / bottle size)', () => {
    const result = calculateVolume('BATCH-001', 5, parkersKolsch)
    const expectedBottles = Math.floor((5 * 128) / 12)
    expect(result.estimatedBottles).toBe(expectedBottles)
  })

  it('case count = floor(bottles / casePack)', () => {
    const result = calculateVolume('BATCH-001', 5, parkersKolsch)
    const expectedBottles = Math.floor((5 * 128) / 12)
    const expectedCases = Math.floor(expectedBottles / 24)
    expect(result.estimatedCases).toBe(expectedCases)
  })

  it('preserves batch ID and tank volume', () => {
    const result = calculateVolume('BATCH-XYZ', 10, parkersKolsch)
    expect(result.batchId).toBe('BATCH-XYZ')
    expect(result.tankVolume).toBe(10)
  })
})
