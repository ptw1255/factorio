import { factoryState } from '../../state'

export function receiveMaterials(items: { ingredient: string; quantity: number; unitCost: number }[]): void {
  for (const item of items) {
    factoryState.addRawMaterial(item.ingredient, item.quantity, item.unitCost)
  }
}
