export interface InventoryItem {
  quantity: number
  unitCost: number
}

export interface FinishedGoodsEntry {
  cases: number
  allocated: number
}

export interface Order {
  orderId: string
  recipeId: string
  quantity: number
  customerId: string
  customerName: string
  deliveryAddress: string
  priority: 'standard' | 'express' | 'event'
  status: 'pending' | 'fulfilled'
  createdAt: string
}

export interface LedgerEntry {
  entryId: string
  timestamp: string
  debitAccount: string
  creditAccount: string
  amount: number
  description: string
  sourceEvent: string
  correlationId: string
}

class FactoryState {
  private rawMaterials = new Map<string, InventoryItem>()
  private finishedGoods = new Map<string, FinishedGoodsEntry>()
  private orders = new Map<string, Order>()
  private ledger: LedgerEntry[] = []
  private accountBalances = new Map<string, number>()

  addRawMaterial(id: string, quantity: number, unitCost: number): void {
    const existing = this.rawMaterials.get(id)
    if (existing) {
      const totalQty = existing.quantity + quantity
      const avgCost = (existing.quantity * existing.unitCost + quantity * unitCost) / totalQty
      this.rawMaterials.set(id, { quantity: totalQty, unitCost: avgCost })
    } else {
      this.rawMaterials.set(id, { quantity, unitCost })
    }
  }

  consumeRawMaterial(id: string, quantity: number): boolean {
    const existing = this.rawMaterials.get(id)
    if (!existing || existing.quantity < quantity) {
      return false
    }
    existing.quantity -= quantity
    return true
  }

  getRawMaterial(id: string): InventoryItem | undefined {
    return this.rawMaterials.get(id)
  }

  addFinishedGoods(recipeId: string, cases: number): void {
    const existing = this.finishedGoods.get(recipeId)
    if (existing) {
      existing.cases += cases
    } else {
      this.finishedGoods.set(recipeId, { cases, allocated: 0 })
    }
  }

  allocateFinishedGoods(recipeId: string, cases: number): boolean {
    const existing = this.finishedGoods.get(recipeId)
    if (!existing || (existing.cases - existing.allocated) < cases) {
      return false
    }
    existing.allocated += cases
    return true
  }

  getFinishedGoods(recipeId: string): FinishedGoodsEntry | undefined {
    return this.finishedGoods.get(recipeId)
  }

  getInventorySnapshot(): {
    rawMaterials: Record<string, InventoryItem>
    finishedGoods: Record<string, FinishedGoodsEntry>
  } {
    return {
      rawMaterials: Object.fromEntries(this.rawMaterials),
      finishedGoods: Object.fromEntries(this.finishedGoods),
    }
  }

  addOrder(params: Omit<Order, 'status' | 'createdAt'>): void {
    this.orders.set(params.orderId, {
      ...params,
      status: 'pending',
      createdAt: new Date().toISOString(),
    })
  }

  getOrder(orderId: string): Order | undefined {
    return this.orders.get(orderId)
  }

  fulfillOrder(orderId: string): void {
    const order = this.orders.get(orderId)
    if (order) order.status = 'fulfilled'
  }

  getPendingOrders(): Order[] {
    return Array.from(this.orders.values()).filter(o => o.status === 'pending')
  }

  appendLedgerEntry(entry: LedgerEntry): void {
    this.ledger.push(entry)
    const debitBal = this.accountBalances.get(entry.debitAccount) || 0
    this.accountBalances.set(entry.debitAccount, debitBal + entry.amount)
    const creditBal = this.accountBalances.get(entry.creditAccount) || 0
    this.accountBalances.set(entry.creditAccount, creditBal - entry.amount)
  }

  getLedger(): LedgerEntry[] {
    return this.ledger
  }

  getAccountBalance(account: string): number {
    return Math.abs(this.accountBalances.get(account) || 0)
  }

  /** Reset all state — useful for testing */
  reset(): void {
    this.rawMaterials.clear()
    this.finishedGoods.clear()
    this.orders.clear()
    this.ledger = []
    this.accountBalances.clear()
  }
}

export const factoryState = new FactoryState()
