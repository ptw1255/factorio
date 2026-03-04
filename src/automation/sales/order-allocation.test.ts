import { allocateOrder } from './order-allocation'
import { factoryState } from '../../state'

beforeEach(() => { factoryState.reset() })

describe('allocateOrder', () => {
  it('allocates stock for FULFILL orders', () => {
    factoryState.addFinishedGoods('parkers-kolsch', 50)
    const result = allocateOrder('order-1', 'parkers-kolsch', 10, 'FULFILL')
    expect(result.allocated).toBe(10)
    expect(result.backordered).toBe(0)
    expect(factoryState.getFinishedGoods('parkers-kolsch')!.allocated).toBe(10)
  })

  it('records backorder without allocation', () => {
    const result = allocateOrder('order-2', 'parkers-kolsch', 10, 'BACKORDER')
    expect(result.allocated).toBe(0)
    expect(result.backordered).toBe(10)
  })
})
