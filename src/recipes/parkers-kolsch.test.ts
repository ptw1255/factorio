import { parkersKolsch } from './parkers-kolsch'

describe("Parker's Kolsch recipe", () => {
  it('has all required top-level fields', () => {
    expect(parkersKolsch.id).toBe('parkers-kolsch')
    expect(parkersKolsch.name).toBeDefined()
    expect(parkersKolsch.style).toBe('Kolsch')
    expect(parkersKolsch.grainBill.length).toBeGreaterThan(0)
    expect(parkersKolsch.hopSchedule.length).toBeGreaterThan(0)
    expect(parkersKolsch.yeast).toBeDefined()
    expect(parkersKolsch.process).toBeDefined()
    expect(parkersKolsch.packaging).toBeDefined()
    expect(parkersKolsch.pricing).toBeDefined()
  })

  it('grain bill percentages sum to 100', () => {
    const total = parkersKolsch.grainBill.reduce((sum, g) => sum + g.percentage, 0)
    expect(total).toBe(100)
  })

  it('has at least one hop addition', () => {
    expect(parkersKolsch.hopSchedule.length).toBeGreaterThanOrEqual(1)
    for (const hop of parkersKolsch.hopSchedule) {
      expect(hop.quantity).toBeGreaterThan(0)
      expect(hop.alphaAcid).toBeGreaterThan(0)
    }
  })

  it('target OG is greater than target FG', () => {
    expect(parkersKolsch.process.targetOG).toBeGreaterThan(parkersKolsch.process.targetFG)
  })

  it('ABV is reasonable for Kolsch style (3-6%)', () => {
    expect(parkersKolsch.process.targetABV).toBeGreaterThanOrEqual(3)
    expect(parkersKolsch.process.targetABV).toBeLessThanOrEqual(6)
  })
})
