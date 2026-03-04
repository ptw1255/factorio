import { inspectBottleBatch } from './inspection'

describe('inspectBottleBatch', () => {
  it('returns an InspectionBatchResult', () => {
    const result = inspectBottleBatch(24)
    expect(result).toHaveProperty('batchSize')
    expect(result).toHaveProperty('passed')
    expect(result).toHaveProperty('rejected')
    expect(result).toHaveProperty('review')
    expect(result).toHaveProperty('inspections')
    expect(result).toHaveProperty('defectSummary')
  })

  it('inspects the correct number of bottles', () => {
    const result = inspectBottleBatch(24)
    expect(result.batchSize).toBe(24)
    expect(result.inspections.length).toBe(24)
  })

  it('counts sum to batch size', () => {
    const result = inspectBottleBatch(24)
    expect(result.passed + result.rejected + result.review).toBe(24)
  })

  it('most bottles pass (~95%+ over large sample)', () => {
    let totalPassed = 0
    const runs = 20
    const batchSize = 100
    for (let i = 0; i < runs; i++) {
      const result = inspectBottleBatch(batchSize)
      totalPassed += result.passed
    }
    const passRate = totalPassed / (runs * batchSize)
    expect(passRate).toBeGreaterThan(0.90)
  })

  it('each inspection has a valid verdict', () => {
    const result = inspectBottleBatch(24)
    for (const inspection of result.inspections) {
      expect(['pass', 'reject', 'review']).toContain(inspection.overallVerdict)
      expect(inspection.confidenceScore).toBeGreaterThanOrEqual(0)
      expect(inspection.confidenceScore).toBeLessThanOrEqual(1)
    }
  })
})
