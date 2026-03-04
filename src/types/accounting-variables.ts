import { OrderPlacedMessage, BrewCompleteMessage, DeliveryCompleteMessage } from './shared'

export interface AccountingProcessVariables {
  eventType: string
  correlationId: string
  amount?: number
  order?: OrderPlacedMessage
  purchase?: {
    supplier: string
    totalCost: number
    items: { ingredient: string; quantity: number; unitCost: number }[]
  }
  batch?: BrewCompleteMessage & { costPerCase?: number }
  delivery?: DeliveryCompleteMessage & { shippingCost?: number }
  ledgerEntryId?: string
}
