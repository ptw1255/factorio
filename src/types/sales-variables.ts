import { Recipe } from './recipe'

export interface SalesOrder {
  customerId: string
  customerName: string
  deliveryAddress: string
  quantity: number
  priority: 'standard' | 'express' | 'event'
  notes: string
}

export interface SalesProcessVariables {
  orderId: string
  recipeId: string
  recipe: Recipe
  order?: SalesOrder
  fulfillmentStatus?: 'FULFILL' | 'BACKORDER'
  allocationResult?: {
    allocated: number
    backordered: number
  }
}
