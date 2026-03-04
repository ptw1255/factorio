import { factoryState, LedgerEntry } from '../../state'
import { generateId } from '../../types/shared'

export function recordShippingCost(shipmentId: string, cost: number): LedgerEntry {
  const entry: LedgerEntry = {
    entryId: generateId('LED'),
    timestamp: new Date().toISOString(),
    debitAccount: 'OPEX-SHIPPING',
    creditAccount: 'CASH',
    amount: cost,
    description: `Shipping cost for ${shipmentId}`,
    sourceEvent: 'DeliveryComplete',
    correlationId: shipmentId,
  }
  factoryState.appendLedgerEntry(entry)
  return entry
}
