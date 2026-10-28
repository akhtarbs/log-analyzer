import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  startTask,
  getTasksSnapshot,
  createScanTicker,
  scanShouldStop,
  throwIfCancelled,
  CancelledError,
  isCancelled,
  cancelTask,
} from '../progress'

beforeEach(() => {
  vi.spyOn(console, 'info').mockImplementation(() => {})
})

describe('progress store', () => {
  it('registers a task, and removes it on finish', () => {
    const before = getTasksSnapshot().length
    const task = startTask('Test task')
    expect(getTasksSnapshot().length).toBe(before + 1)
    expect(getTasksSnapshot().find((t) => t.id === task.id)?.label).toBe('Test task')

    const ms = task.finish()
    expect(ms).toBeGreaterThanOrEqual(0)
    expect(getTasksSnapshot().find((t) => t.id === task.id)).toBeUndefined()
  })

  it('finish() is idempotent and returns the same duration', () => {
    const task = startTask('Idempotent')
    const a = task.finish()
    const b = task.finish()
    expect(b).toBe(a)
  })

  it('clamps percent into 0-100 and keeps detail text', async () => {
    const task = startTask('Clamp')
    task.update(250, 'over')
    await new Promise((r) => setTimeout(r, 150)) // updates are throttled to ~100ms
    const snap = getTasksSnapshot().find((t) => t.id === task.id)!
    expect(snap.percent).toBe(100)
    expect(snap.detail).toBe('over')
    task.finish()
  })

  it('cancel() aborts the signal and flags the task as cancelling', () => {
    const task = startTask('Cancel me', { cancellable: true })
    task.cancel()
    expect(task.signal.aborted).toBe(true)
    expect(getTasksSnapshot().find((t) => t.id === task.id)?.cancelling).toBe(true)
    task.finish()
  })

  it('cancelTask(id) works from the UI side', () => {
    const task = startTask('Cancel by id', { cancellable: true })
    cancelTask(task.id)
    expect(task.signal.aborted).toBe(true)
    task.finish()
  })

  it('ignores updates after finish', () => {
    const task = startTask('Done')
    task.finish()
    expect(() => task.update(50, 'late')).not.toThrow()
  })
})

describe('createScanTicker', () => {
  it('never throws itself (Dexie swallows exceptions thrown from each() callbacks)', () => {
    const task = startTask('Scan', { cancellable: true })
    const tick = createScanTicker(1000, task)
    task.cancel()
    expect(() => tick()).not.toThrow()
    task.finish()
  })

  it('scanShouldStop flips to true on cancel, and throwIfCancelled then throws CancelledError', () => {
    const task = startTask('Scan', { cancellable: true })
    const stop = scanShouldStop(task)
    expect(stop()).toBe(false)
    expect(() => throwIfCancelled(task)).not.toThrow()
    task.cancel()
    expect(stop()).toBe(true)
    expect(() => throwIfCancelled(task)).toThrow(CancelledError)
    task.finish()
  })

  it('scanShouldStop / throwIfCancelled are no-ops without a task', () => {
    expect(scanShouldStop()()).toBe(false)
    expect(() => throwIfCancelled()).not.toThrow()
  })

  it('is a harmless no-op without a task', () => {
    const tick = createScanTicker(10)
    expect(() => { for (let i = 0; i < 50; i++) tick() }).not.toThrow()
  })

  it('reports progress as "n / total" at the configured interval', async () => {
    const task = startTask('Progress')
    const tick = createScanTicker(100, task, 10)
    for (let i = 0; i < 50; i++) tick()
    await new Promise((r) => setTimeout(r, 150))
    const snap = getTasksSnapshot().find((t) => t.id === task.id)!
    expect(snap.percent).toBe(50)
    expect(snap.detail).toBe('50 / 100 events')
    task.finish()
  })
})

describe('isCancelled', () => {
  it('recognizes CancelledError instances and look-alikes by name', () => {
    expect(isCancelled(new CancelledError())).toBe(true)
    expect(isCancelled({ name: 'CancelledError' })).toBe(true)
    expect(isCancelled(new Error('other'))).toBe(false)
    expect(isCancelled(null)).toBe(false)
  })
})
