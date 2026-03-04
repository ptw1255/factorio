export interface RoutePlan {
  truckId: string
  estimatedDistance: number
  estimatedHours: number
  route: string
}

export interface LoadAssignment {
  billOfLadingId: string
  palletIds: string[]
  totalWeight: number
  truckId: string
}

export interface DeliveryResult {
  deliveredAt: string
  signedBy: string
  condition: 'good' | 'damaged'
}

export interface DistributionProcessVariables {
  shipmentId: string
  batchId: string
  orderId: string
  palletCount: number
  totalWeight: number
  deliveryAddress: string
  route?: RoutePlan
  loadAssignment?: LoadAssignment
  transitTimeSeconds?: number
  deliveryResult?: DeliveryResult
}
