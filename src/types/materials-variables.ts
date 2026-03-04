import { Recipe } from './recipe'

export interface InventoryCheckResult {
  sufficient: boolean
  available: Record<string, number>
  required: Record<string, number>
  shortages: Record<string, number>
}

export interface SupplierDecision {
  supplier: string
  totalCost: number
  leadTimeDays: number
  items: { ingredient: string; quantity: number; unitCost: number }[]
}

export interface MaterialsProcessVariables {
  orderId: string
  recipeId: string
  recipe: Recipe
  batchId: string
  inventoryCheck?: InventoryCheckResult
  supplierDecision?: SupplierDecision
  purchaseOrder?: {
    poId: string
    supplier: string
    totalCost: number
    items: { ingredient: string; quantity: number; unitCost: number }[]
  }
}
