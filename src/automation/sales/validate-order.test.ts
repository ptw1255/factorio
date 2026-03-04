import { validateOrder } from './validate-order'
import { factoryState } from '../../state'

beforeEach(() => { factoryState.reset() })

describe('validateOrder', () => {
  it('returns FULFILL when enough stock', () => {
    factoryState.addFinishedGoods('parkers-kolsch', 50)
    const result = validateOrder('parkers-kolsch', 10)
    expect(result.status).toBe('FULFILL')
    expect(result.available).toBe(50)
    expect(result.requested).toBe(10)
  })

  it('returns BACKORDER when no stock', () => {
    const result = validateOrder('parkers-kolsch', 10)
    expect(result.status).toBe('BACKORDER')
    expect(result.available).toBe(0)
  })

  it('returns BACKORDER when insufficient stock', () => {
    factoryState.addFinishedGoods('parkers-kolsch', 3)
    const result = validateOrder('parkers-kolsch', 10)
    expect(result.status).toBe('BACKORDER')
  })

  it('accounts for already-allocated stock', () => {
    factoryState.addFinishedGoods('parkers-kolsch', 20)
    factoryState.allocateFinishedGoods('parkers-kolsch', 15)
    const result = validateOrder('parkers-kolsch', 10)
    expect(result.status).toBe('BACKORDER')
    expect(result.available).toBe(5)
  })
})
