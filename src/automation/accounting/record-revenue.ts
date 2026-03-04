import { factoryState, LedgerEntry } from '../../state'
import { generateId } from '../../types/shared'

export function recordRevenue(orderId: string, recipeId: string, cases: number, pricePerCase: number): LedgerEntry {
  const amount = cases * pricePerCase
  const entry: LedgerEntry = {
    entryId: generateId('LED'),
    timestamp: new Date().toISOString(),
    debitAccount: 'CASH',
    creditAccount: 'REV-SALES',
    amount,
    description: `Sale of ${cases} cases of ${recipeId} @ $${pricePerCase}/case`,
    sourceEvent: 'OrderPlaced',
    correlationId: orderId,
  }
  factoryState.appendLedgerEntry(entry)
  return entry
}
