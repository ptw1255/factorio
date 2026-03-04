import { recordRevenue } from './record-revenue'
import { recordMaterialsCost } from './record-materials-cost'
import { calculateBatchCost } from './calculate-batch-cost'
import { recordShippingCost } from './record-shipping-cost'
import { factoryState } from '../../state'
import { parkersKolsch } from '../../recipes/parkers-kolsch'

beforeEach(() => { factoryState.reset() })

describe('recordRevenue', () => {
  it('creates ledger entry debiting CASH, crediting REV-SALES', () => {
    const entry = recordRevenue('order-1', 'parkers-kolsch', 10, 36)
    expect(entry.debitAccount).toBe('CASH')
    expect(entry.creditAccount).toBe('REV-SALES')
    expect(entry.amount).toBe(360)
    expect(factoryState.getAccountBalance('CASH')).toBe(360)
    expect(factoryState.getAccountBalance('REV-SALES')).toBe(360)
  })
})

describe('recordMaterialsCost', () => {
  it('creates ledger entry debiting INV-RAW, crediting CASH', () => {
    const entry = recordMaterialsCost('po-1', 150)
    expect(entry.debitAccount).toBe('INV-RAW')
    expect(entry.creditAccount).toBe('CASH')
    expect(entry.amount).toBe(150)
  })
})

describe('calculateBatchCost', () => {
  it('creates batch cost sheet with materials, labor, and overhead', () => {
    const result = calculateBatchCost('batch-1', parkersKolsch, 50)
    expect(result.totalMaterials).toBeGreaterThan(0)
    expect(result.totalLabor).toBeGreaterThan(0)
    expect(result.totalOverhead).toBeGreaterThan(0)
    expect(result.totalCost).toBe(result.totalMaterials + result.totalLabor + result.totalOverhead)
    expect(result.costPerCase).toBe(result.totalCost / 50)
  })

  it('creates ledger entries moving value from RAW to FG', () => {
    calculateBatchCost('batch-1', parkersKolsch, 50)
    expect(factoryState.getLedger().length).toBeGreaterThanOrEqual(1)
  })
})

describe('recordShippingCost', () => {
  it('creates ledger entry debiting OPEX-SHIPPING, crediting CASH', () => {
    const entry = recordShippingCost('ship-1', 75)
    expect(entry.debitAccount).toBe('OPEX-SHIPPING')
    expect(entry.creditAccount).toBe('CASH')
    expect(entry.amount).toBe(75)
  })
})
