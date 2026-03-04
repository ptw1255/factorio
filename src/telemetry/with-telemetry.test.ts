import { withTelemetry } from './with-telemetry'

describe('withTelemetry', () => {
  it('calls handler and returns result for sync handlers', () => {
    const handler = jest.fn((job: any) => ({ success: true }))
    const wrapped = withTelemetry('test-process', 'test-worker', 'automation', handler)
    const fakeJob = { variables: { batchId: 'BATCH-001' } }
    const result = wrapped(fakeJob)
    expect(handler).toHaveBeenCalledWith(fakeJob)
    expect(result).toEqual({ success: true })
  })

  it('calls handler and returns result for async handlers', async () => {
    const handler = jest.fn(async (job: any) => ({ success: true }))
    const wrapped = withTelemetry('test-process', 'test-worker', 'llm', handler)
    const fakeJob = { variables: { batchId: 'BATCH-002' } }
    const result = await wrapped(fakeJob)
    expect(handler).toHaveBeenCalledWith(fakeJob)
    expect(result).toEqual({ success: true })
  })

  it('propagates errors from sync handlers', () => {
    const handler = jest.fn(() => { throw new Error('test error') })
    const wrapped = withTelemetry('test-process', 'test-worker', 'automation', handler)
    expect(() => wrapped({ variables: {} })).toThrow('test error')
  })

  it('propagates errors from async handlers', async () => {
    const handler = jest.fn(async () => { throw new Error('async error') })
    const wrapped = withTelemetry('test-process', 'test-worker', 'llm', handler)
    await expect(wrapped({ variables: {} })).rejects.toThrow('async error')
  })
})
