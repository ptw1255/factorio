export interface DeliveryResult {
  deliveredAt: string
  signedBy: string
  condition: 'good' | 'damaged'
}

const RECEIVERS = [
  'J. Martinez', 'A. Williams', 'K. Johnson', 'M. Brown',
  'R. Davis', 'S. Lee', 'T. Wilson', 'L. Anderson',
]

export function confirmDelivery(shipmentId: string): DeliveryResult {
  return {
    deliveredAt: new Date().toISOString(),
    signedBy: RECEIVERS[Math.floor(Math.random() * RECEIVERS.length)],
    condition: Math.random() < 0.95 ? 'good' : 'damaged',
  }
}
