import { Recipe } from '../../types/recipe'
import { factoryState } from '../../state'
import { calculateRequirements } from './calculate-requirements'

export interface InventoryCheckResult {
  sufficient: boolean
  available: Record<string, number>
  required: Record<string, number>
  shortages: Record<string, number>
}

export function checkInventory(recipe: Recipe): InventoryCheckResult {
  const required = calculateRequirements(recipe, 1)
  const available: Record<string, number> = {}
  const shortages: Record<string, number> = {}

  for (const [ingredient, qty] of Object.entries(required)) {
    const stock = factoryState.getRawMaterial(ingredient)
    available[ingredient] = stock?.quantity || 0
    if ((stock?.quantity || 0) < qty) {
      shortages[ingredient] = qty - (stock?.quantity || 0)
    }
  }

  return { sufficient: Object.keys(shortages).length === 0, available, required, shortages }
}
