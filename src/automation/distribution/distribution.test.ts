import { assignLoad } from './load-assignment'
import { calculateTransitTime } from './dispatch'
import { confirmDelivery } from './delivery-confirmation'

describe('assignLoad', () => {
  it('generates bill of lading with pallets', () => {
    const result = assignLoad('truck-01', 'ship-123', 3, 2400)
    expect(result.billOfLadingId).toMatch(/^BOL-/)
    expect(result.palletIds).toHaveLength(3)
    expect(result.totalWeight).toBe(2400)
    expect(result.truckId).toBe('truck-01')
  })
})

describe('calculateTransitTime', () => {
  it('returns transit time in seconds based on distance', () => {
    const result = calculateTransitTime(100)
    expect(result).toBeGreaterThanOrEqual(3)
    expect(result).toBeLessThanOrEqual(8)
  })
})

describe('confirmDelivery', () => {
  it('returns delivery result', () => {
    const result = confirmDelivery('ship-123')
    expect(result.deliveredAt).toBeDefined()
    expect(result.signedBy).toBeDefined()
    expect(['good', 'damaged']).toContain(result.condition)
  })

  it('most deliveries are in good condition', () => {
    let goodCount = 0
    for (let i = 0; i < 50; i++) {
      if (confirmDelivery(`ship-${i}`).condition === 'good') goodCount++
    }
    expect(goodCount).toBeGreaterThan(40)
  })
})
