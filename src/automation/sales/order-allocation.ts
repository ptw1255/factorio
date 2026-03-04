import { factoryState } from '../../state'

export interface AllocationResult {
  allocated: number
  backordered: number
}

export function allocateOrder(
  orderId: string,
  recipeId: string,
  quantity: number,
  status: 'FULFILL' | 'BACKORDER'
): AllocationResult {
  if (status === 'FULFILL') {
    factoryState.allocateFinishedGoods(recipeId, quantity)
    return { allocated: quantity, backordered: 0 }
  }
  return { allocated: 0, backordered: quantity }
}
