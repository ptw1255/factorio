import { factoryState, LedgerEntry } from '../../state'
import { generateId } from '../../types/shared'

export function recordMaterialsCost(poId: string, totalCost: number): LedgerEntry {
  const entry: LedgerEntry = {
    entryId: generateId('LED'),
    timestamp: new Date().toISOString(),
    debitAccount: 'INV-RAW',
    creditAccount: 'CASH',
    amount: totalCost,
    description: `Purchase order ${poId}`,
    sourceEvent: 'MaterialsPurchased',
    correlationId: poId,
  }
  factoryState.appendLedgerEntry(entry)
  return entry
}
