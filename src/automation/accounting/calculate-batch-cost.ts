import { Recipe } from '../../types/recipe'
import { factoryState, LedgerEntry } from '../../state'
import { generateId } from '../../types/shared'

export interface BatchCostSheet {
  batchId: string
  recipeId: string
  totalMaterials: number
  totalLabor: number
  totalOverhead: number
  totalCost: number
  casesProduced: number
  costPerCase: number
}

export function calculateBatchCost(batchId: string, recipe: Recipe, casesProduced: number): BatchCostSheet {
  const grainCost = recipe.grainBill.reduce((sum, g) => sum + g.quantity * 1.50, 0)
  const hopCost = recipe.hopSchedule.reduce((sum, h) => sum + h.quantity * 3.00, 0)
  const yeastCost = recipe.yeast.quantity * 8.00
  const totalMaterials = grainCost + hopCost + yeastCost
  const totalLabor = 2 * 25 + 1 * 20
  const totalOverhead = 15
  const totalCost = totalMaterials + totalLabor + totalOverhead

  const entry: LedgerEntry = {
    entryId: generateId('LED'),
    timestamp: new Date().toISOString(),
    debitAccount: 'INV-FG',
    creditAccount: 'INV-RAW',
    amount: totalCost,
    description: `Batch ${batchId} — ${casesProduced} cases of ${recipe.id}`,
    sourceEvent: 'BrewComplete',
    correlationId: batchId,
  }
  factoryState.appendLedgerEntry(entry)

  return { batchId, recipeId: recipe.id, totalMaterials, totalLabor, totalOverhead, totalCost, casesProduced, costPerCase: totalCost / casesProduced }
}
