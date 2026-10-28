import { describe, it, expect, vi } from 'vitest'
import { createSerialQueue } from '../serialQueue'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

describe('createSerialQueue', () => {
  it('runs jobs in order even when an earlier job is slower (the import "done before last chunk" bug)', async () => {
    const order: string[] = []
    const enqueue = createSerialQueue(() => {})

    // Simulates: slow chunk write, fast chunk write, then the worker's "done" message.
    enqueue(async () => { await sleep(30); order.push('chunk-1') })
    enqueue(async () => { await sleep(1); order.push('chunk-2') })
    const last = enqueue(() => { order.push('done') })
    await last

    expect(order).toEqual(['chunk-1', 'chunk-2', 'done'])
  })

  it('without the queue, concurrent async handlers finish out of order (documents the original bug)', async () => {
    const order: string[] = []
    const handler = async (name: string, ms: number) => { await sleep(ms); order.push(name) }
    await Promise.all([handler('chunk-1', 30), handler('chunk-2', 1), handler('done', 0)])
    expect(order[order.length - 1]).not.toBe('done')
  })

  it('reports a failing job to onError and keeps processing later jobs', async () => {
    const onError = vi.fn()
    const ran: string[] = []
    const enqueue = createSerialQueue(onError)

    enqueue(() => { throw new Error('boom') })
    await enqueue(() => { ran.push('after') })

    expect(onError).toHaveBeenCalledTimes(1)
    expect((onError.mock.calls[0][0] as Error).message).toBe('boom')
    expect(ran).toEqual(['after'])
  })
})
