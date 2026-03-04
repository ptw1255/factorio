import { Recipe } from '../../types/recipe'
import { LageringResult } from '../../types/brewing-variables'

/**
 * Check lagering progress. Clarity improves over time.
 * clarityScore = min(10, 3 + (daysCompleted / targetDays) * 7)
 */
export function checkLagering(recipe: Recipe, daysCompleted: number): LageringResult {
  const targetDays = recipe.process.lageringDays ?? 0
  const temp = recipe.process.lageringTemp ?? 34

  const clarityScore = Math.min(10, 3 + (daysCompleted / Math.max(targetDays, 1)) * 7)

  return {
    daysCompleted,
    targetDays,
    temp,
    clarityScore: Math.round(clarityScore * 10) / 10,
  }
}
