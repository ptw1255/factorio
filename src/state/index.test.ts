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

describe('factoryState — orders', () => {
  it('addOrder stores a pending order', () => {
    factoryState.addOrder({
      orderId: 'order-1', recipeId: 'parkers-kolsch', quantity: 10,
      customerId: 'cust-1', customerName: 'Test Bar',
      deliveryAddress: '123 Main St', priority: 'standard' as const,
    })
    const order = factoryState.getOrder('order-1')
    expect(order).toBeDefined()
    expect(order!.status).toBe('pending')
    expect(order!.quantity).toBe(10)
  })

  it('fulfillOrder changes status to fulfilled', () => {
    factoryState.addOrder({
      orderId: 'order-2', recipeId: 'parkers-kolsch', quantity: 5,
      customerId: 'cust-2', customerName: 'Test Pub',
      deliveryAddress: '456 Oak Ave', priority: 'express' as const,
    })
    factoryState.fulfillOrder('order-2')
    expect(factoryState.getOrder('order-2')!.status).toBe('fulfilled')
  })

  it('getPendingOrders returns only pending orders', () => {
    factoryState.addOrder({ orderId: 'o-a', recipeId: 'pk', quantity: 1, customerId: 'c1', customerName: 'A', deliveryAddress: 'a', priority: 'standard' as const })
    factoryState.addOrder({ orderId: 'o-b', recipeId: 'pk', quantity: 2, customerId: 'c2', customerName: 'B', deliveryAddress: 'b', priority: 'standard' as const })
    factoryState.fulfillOrder('o-a')
    expect(factoryState.getPendingOrders()).toHaveLength(1)
    expect(factoryState.getPendingOrders()[0].orderId).toBe('o-b')
  })
})

describe('factoryState — ledger', () => {
  it('appendLedgerEntry adds to ledger', () => {
    factoryState.appendLedgerEntry({
      entryId: 'entry-1', timestamp: new Date().toISOString(),
      debitAccount: 'CASH', creditAccount: 'REV-SALES', amount: 360,
      description: 'Sale of 10 cases', sourceEvent: 'OrderPlaced', correlationId: 'order-1',
    })
    expect(factoryState.getLedger()).toHaveLength(1)
  })

  it('getAccountBalance returns correct balance', () => {
    factoryState.appendLedgerEntry({
      entryId: 'e-1', timestamp: new Date().toISOString(),
      debitAccount: 'CASH', creditAccount: 'REV-SALES', amount: 100,
      description: 'test', sourceEvent: 'test', correlationId: 'test',
    })
    expect(factoryState.getAccountBalance('CASH')).toBe(100)
    expect(factoryState.getAccountBalance('REV-SALES')).toBe(100)
  })

  it('multiple entries accumulate balances', () => {
    factoryState.appendLedgerEntry({
      entryId: 'e-1', timestamp: new Date().toISOString(),
      debitAccount: 'CASH', creditAccount: 'REV-SALES', amount: 100,
      description: 'sale 1', sourceEvent: 'OrderPlaced', correlationId: 'o1',
    })
    factoryState.appendLedgerEntry({
      entryId: 'e-2', timestamp: new Date().toISOString(),
      debitAccount: 'OPEX-SHIPPING', creditAccount: 'CASH', amount: 25,
      description: 'shipping', sourceEvent: 'DeliveryComplete', correlationId: 's1',
    })
    expect(factoryState.getAccountBalance('CASH')).toBe(75)
    expect(factoryState.getAccountBalance('REV-SALES')).toBe(100)
    expect(factoryState.getAccountBalance('OPEX-SHIPPING')).toBe(25)
  })
})
