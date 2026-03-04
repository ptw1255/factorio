import { factoryState } from './index'

beforeEach(() => {
  factoryState.reset()
})

describe('factoryState — raw materials', () => {
  it('addRawMaterial adds to inventory', () => {
    factoryState.addRawMaterial('pilsner-malt', 100, 1.50)
    const item = factoryState.getRawMaterial('pilsner-malt')
    expect(item).toBeDefined()
    expect(item!.quantity).toBe(100)
    expect(item!.unitCost).toBe(1.50)
  })

  it('addRawMaterial merges with weighted average cost', () => {
    factoryState.addRawMaterial('hops', 10, 2.00)
    factoryState.addRawMaterial('hops', 10, 3.00)
    const item = factoryState.getRawMaterial('hops')
    expect(item!.quantity).toBe(20)
    expect(item!.unitCost).toBe(2.50)
  })

  it('consumeRawMaterial decrements and returns true', () => {
    factoryState.addRawMaterial('yeast', 5, 8.00)
    const result = factoryState.consumeRawMaterial('yeast', 2)
    expect(result).toBe(true)
    expect(factoryState.getRawMaterial('yeast')!.quantity).toBe(3)
  })

  it('consumeRawMaterial returns false if insufficient', () => {
    factoryState.addRawMaterial('yeast', 1, 8.00)
    const result = factoryState.consumeRawMaterial('yeast', 5)
    expect(result).toBe(false)
  })

  it('consumeRawMaterial returns false for unknown item', () => {
    const result = factoryState.consumeRawMaterial('unknown', 1)
    expect(result).toBe(false)
  })
})

describe('factoryState — finished goods', () => {
  it('addFinishedGoods adds to inventory', () => {
    factoryState.addFinishedGoods('parkers-kolsch', 50)
    const entry = factoryState.getFinishedGoods('parkers-kolsch')
    expect(entry).toBeDefined()
    expect(entry!.cases).toBe(50)
    expect(entry!.allocated).toBe(0)
  })

  it('addFinishedGoods accumulates', () => {
    factoryState.addFinishedGoods('parkers-kolsch', 50)
    factoryState.addFinishedGoods('parkers-kolsch', 30)
    expect(factoryState.getFinishedGoods('parkers-kolsch')!.cases).toBe(80)
  })

  it('allocateFinishedGoods reserves stock', () => {
    factoryState.addFinishedGoods('parkers-kolsch', 50)
    const result = factoryState.allocateFinishedGoods('parkers-kolsch', 20)
    expect(result).toBe(true)
    expect(factoryState.getFinishedGoods('parkers-kolsch')!.allocated).toBe(20)
  })

  it('allocateFinishedGoods returns false if insufficient unallocated', () => {
    factoryState.addFinishedGoods('parkers-kolsch', 10)
    factoryState.allocateFinishedGoods('parkers-kolsch', 8)
    const result = factoryState.allocateFinishedGoods('parkers-kolsch', 5)
    expect(result).toBe(false)
  })
})

describe('factoryState — snapshot', () => {
  it('getInventorySnapshot returns current state', () => {
    factoryState.addRawMaterial('malt', 100, 1.50)
    factoryState.addFinishedGoods('kolsch', 25)
    const snapshot = factoryState.getInventorySnapshot()
    expect(snapshot.rawMaterials['malt']).toBeDefined()
    expect(snapshot.finishedGoods['kolsch']).toBeDefined()
  })
})
