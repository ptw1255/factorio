import { generateId } from '../../types/shared'

export interface LoadAssignmentResult {
  billOfLadingId: string
  palletIds: string[]
  totalWeight: number
  truckId: string
}

export function assignLoad(truckId: string, shipmentId: string, palletCount: number, totalWeight: number): LoadAssignmentResult {
  const palletIds = Array.from({ length: palletCount }, (_, i) =>
    `${shipmentId}-PLT-${String(i + 1).padStart(2, '0')}`
  )
  return { billOfLadingId: generateId('BOL'), palletIds, totalWeight, truckId }
}
