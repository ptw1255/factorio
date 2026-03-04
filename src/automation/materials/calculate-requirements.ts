import { Recipe } from '../../types/recipe'

export function calculateRequirements(recipe: Recipe, batches: number): Record<string, number> {
  const requirements: Record<string, number> = {}
  for (const grain of recipe.grainBill) {
    requirements[grain.grain] = (requirements[grain.grain] || 0) + grain.quantity * batches
  }
  for (const hop of recipe.hopSchedule) {
    requirements[hop.hop] = (requirements[hop.hop] || 0) + hop.quantity * batches
  }
  requirements[recipe.yeast.strain] = (requirements[recipe.yeast.strain] || 0) + recipe.yeast.quantity * batches
  return requirements
}
