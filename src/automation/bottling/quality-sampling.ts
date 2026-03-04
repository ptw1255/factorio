import { Recipe } from '../../types/recipe'
import { QualitySample } from '../../types/bottling-variables'

/**
 * Quality sampling — carbonation, clarity, ABV check.
 */
export function sampleQuality(recipe: Recipe, actualABV: number): QualitySample {
  // Carbonation: 2.3-2.8 volumes CO2 is typical for Kolsch
  const carbonationLevel = 2.3 + Math.random() * 0.5
  const carbonationTarget = 2.5
  const carbonationPassed = carbonationLevel >= 2.2 && carbonationLevel <= 2.9

  // Clarity: score 7-10
  const clarityScore = 7 + Math.random() * 3
  const clarityPassed = clarityScore > 7

  // ABV: deviation from target
  const abvDeviation = actualABV - recipe.process.targetABV
  const abvPassed = Math.abs(abvDeviation) <= 0.3

  const overallPassed = carbonationPassed && clarityPassed && abvPassed

  return {
    carbonation: {
      level: Math.round(carbonationLevel * 100) / 100,
      target: carbonationTarget,
      passed: carbonationPassed,
    },
    clarity: {
      score: Math.round(clarityScore * 10) / 10,
      passed: clarityPassed,
    },
    abv: {
      measured: actualABV,
      target: recipe.process.targetABV,
      deviation: Math.round(abvDeviation * 100) / 100,
      passed: abvPassed,
    },
    overallPassed,
  }
}
