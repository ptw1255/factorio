import { Recipe } from './recipe'
import crypto from 'crypto'

// --- ID generation ---

export function generateId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`
}

// --- Cross-process message types ---

export interface OrderPlacedMessage {
  orderId: string
  recipeId: string
  quantity: number
  customerId: string
  priority: 'standard' | 'express' | 'event'
  deliveryAddress: string
}

export interface MaterialsReadyMessage {
  batchId: string
  recipeId: string
  recipe: Recipe
}

export interface BrewCompleteMessage {
  batchId: string
  recipeId: string
  volume: number
  qualityScore: number
  tastingNotes: string
}

export interface BottlesReadyMessage {
  batchId: string
  bottleCount: number
  qualityData: Record<string, unknown>
}

export interface PalletsReadyMessage {
  batchId: string
  shipmentId: string
  palletCount: number
  totalWeight: number
}

export interface DeliveryCompleteMessage {
  shipmentId: string
  orderId: string
  deliveredAt: string
}

export interface MaterialsPurchasedMessage {
  poId: string
  supplier: string
  totalCost: number
  items: { ingredient: string; quantity: number; unitCost: number }[]
}

export interface ShipmentRequestedMessage {
  shipmentId: string
  orderId: string
  recipeId: string
  palletCount: number
  deliveryAddress: string
}

export interface ProductionNeededMessage {
  orderId: string
  recipeId: string
  quantity: number
}
