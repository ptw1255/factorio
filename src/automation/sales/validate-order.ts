import { factoryState } from '../../state'

export interface ValidationResult {
  status: 'FULFILL' | 'BACKORDER'
  available: number
  requested: number
}

export function validateOrder(recipeId: string, quantity: number): ValidationResult {
  const fg = factoryState.getFinishedGoods(recipeId)
  const available = fg ? fg.cases - fg.allocated : 0

  return {
    status: available >= quantity ? 'FULFILL' : 'BACKORDER',
    available,
    requested: quantity,
  }
}
