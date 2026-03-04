import { VisionInspection, RoboticArmTelemetry } from '../../types/telemetry'
import { InspectionBatchResult } from '../../types/crating-variables'

function inspectBottle(index: number): VisionInspection {
  const bottleId = `BTL-${String(index).padStart(4, '0')}`

  // Generate defect probabilities
  const crackChance = Math.random()
  const chipChance = Math.random()
  const underfillChance = Math.random()
  const labelChance = Math.random()
  const foreignChance = Math.random()

  const crack = { detected: crackChance > 0.98, confidence: crackChance > 0.98 ? 0.8 + Math.random() * 0.2 : Math.random() * 0.1 }
  const chip = { detected: chipChance > 0.98, confidence: chipChance > 0.98 ? 0.7 + Math.random() * 0.3 : Math.random() * 0.1 }
  const underfill = {
    detected: underfillChance > 0.97,
    confidence: underfillChance > 0.97 ? 0.6 + Math.random() * 0.4 : Math.random() * 0.05,
    fillLevel: underfillChance > 0.97 ? 0.85 + Math.random() * 0.1 : undefined,
  }
  const label = { present: labelChance < 0.995, aligned: labelChance < 0.99, readable: true }
  const foreignObject = { detected: foreignChance > 0.999, confidence: foreignChance > 0.999 ? 0.5 + Math.random() * 0.5 : 0 }

  const hasDefect = crack.detected || chip.detected || underfill.detected || !label.present || !label.aligned || foreignObject.detected

  let overallVerdict: 'pass' | 'reject' | 'review' = 'pass'
  let confidenceScore = 0.95 + Math.random() * 0.05

  if (hasDefect) {
    // Check if any defect confidence is in the "review" range (0.4-0.8)
    const defectConfidences = [crack.confidence, chip.confidence, underfill.confidence, foreignObject.confidence].filter(c => c > 0.3)
    const lowConfidence = defectConfidences.some(c => c >= 0.4 && c <= 0.8)

    if (foreignObject.detected) {
      overallVerdict = 'reject'
      confidenceScore = foreignObject.confidence
    } else if (lowConfidence && Math.random() > 0.7) {
      overallVerdict = 'review'
      confidenceScore = 0.4 + Math.random() * 0.4
    } else {
      overallVerdict = 'reject'
      confidenceScore = Math.max(...defectConfidences, 0.8)
    }
  }

  return {
    bottleId,
    defects: { crack, chip, underfill, label, foreignObject },
    overallVerdict,
    confidenceScore: Math.round(confidenceScore * 100) / 100,
  }
}

/**
 * Inspect a batch of bottles (typically 24 per case).
 */
export function inspectBottleBatch(batchSize: number): InspectionBatchResult {
  const inspections: VisionInspection[] = []
  const defectSummary: Record<string, number> = {}

  for (let i = 0; i < batchSize; i++) {
    const inspection = inspectBottle(i)
    inspections.push(inspection)

    if (inspection.overallVerdict !== 'pass') {
      const defects = inspection.defects
      if (defects.crack.detected) defectSummary['crack'] = (defectSummary['crack'] || 0) + 1
      if (defects.chip.detected) defectSummary['chip'] = (defectSummary['chip'] || 0) + 1
      if (defects.underfill.detected) defectSummary['underfill'] = (defectSummary['underfill'] || 0) + 1
      if (!defects.label.present || !defects.label.aligned) defectSummary['label'] = (defectSummary['label'] || 0) + 1
      if (defects.foreignObject.detected) defectSummary['foreignObject'] = (defectSummary['foreignObject'] || 0) + 1
    }
  }

  return {
    batchSize,
    passed: inspections.filter(i => i.overallVerdict === 'pass').length,
    rejected: inspections.filter(i => i.overallVerdict === 'reject').length,
    review: inspections.filter(i => i.overallVerdict === 'review').length,
    inspections,
    defectSummary,
  }
}
