export interface InventoryItem {
  quantity: number
  unitCost: number
}

export interface FinishedGoodsEntry {
  cases: number
  allocated: number
}

class FactoryState {
  private rawMaterials = new Map<string, InventoryItem>()
  private finishedGoods = new Map<string, FinishedGoodsEntry>()

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

  /** Reset all state — useful for testing */
  reset(): void {
    this.rawMaterials.clear()
    this.finishedGoods.clear()
  }
}

export const factoryState = new FactoryState()
