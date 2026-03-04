import { checkInventory } from './check-inventory'
import { calculateRequirements } from './calculate-requirements'
import { receiveMaterials } from './receive-materials'
import { factoryState } from '../../state'
import { parkersKolsch } from '../../recipes/parkers-kolsch'

beforeEach(() => { factoryState.reset() })

describe('checkInventory', () => {
  it('returns sufficient=false when no stock', () => {
    const result = checkInventory(parkersKolsch)
    expect(result.sufficient).toBe(false)
    expect(Object.keys(result.shortages).length).toBeGreaterThan(0)
  })

  it('returns sufficient=true when stock is adequate', () => {
    factoryState.addRawMaterial('Pilsner Malt', 20, 1.50)
    factoryState.addRawMaterial('Hallertau', 10, 2.00)
    factoryState.addRawMaterial('Kolsch Yeast (WLP029)', 5, 8.00)
    const result = checkInventory(parkersKolsch)
    expect(result.sufficient).toBe(true)
    expect(Object.keys(result.shortages).length).toBe(0)
  })
})

describe('calculateRequirements', () => {
  it('calculates ingredients for 1 batch', () => {
    const result = calculateRequirements(parkersKolsch, 1)
    expect(result['Pilsner Malt']).toBe(9)
    expect(result['Hallertau']).toBe(2)
    expect(result['Kolsch Yeast (WLP029)']).toBe(2)
  })

  it('scales for multiple batches', () => {
    const result = calculateRequirements(parkersKolsch, 3)
    expect(result['Pilsner Malt']).toBe(27)
  })
})

describe('receiveMaterials', () => {
  it('adds purchased materials to inventory', () => {
    receiveMaterials([
      { ingredient: 'Pilsner Malt', quantity: 50, unitCost: 1.50 },
      { ingredient: 'Hallertau', quantity: 10, unitCost: 2.50 },
    ])
    expect(factoryState.getRawMaterial('Pilsner Malt')!.quantity).toBe(50)
    expect(factoryState.getRawMaterial('Hallertau')!.quantity).toBe(10)
  })
})
