// @vitest-environment node
import 'fake-indexeddb/auto'
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest'
import { db } from '../../db/database'
import { importFile, type ImportProgress } from '../importService'
import { CancelledError, cancelTask, getTasksSnapshot } from '../progress'

/**
 * Runs the REAL worker module and the REAL importService against each other, with a fake
 * Worker that just delivers messages asynchronously. Not a browser — but it exercises the
 * whole message protocol (chunk / ack backpressure / done / error / terminate) plus IndexedDB.
 */
const stats = { chunksInFlight: 0, maxInFlight: 0, acks: 0, chunks: 0 }
let current: FakeWorker | null = null

const scope: { onmessage: ((e: { data: any }) => void) | null; postMessage: (m: any) => void } = {
  onmessage: null,
  postMessage(msg) {
    const w = current
    if (!w || w.terminated) return
    if (msg.type === 'chunk') {
      stats.chunks++
      stats.chunksInFlight++
      stats.maxInFlight = Math.max(stats.maxInFlight, stats.chunksInFlight)
    }
    setTimeout(() => { if (!w.terminated) w.onmessage?.({ data: msg }) }, 0)
  },
}

class FakeWorker {
  onmessage: ((e: { data: any }) => void) | null = null
  onerror: ((e: any) => void) | null = null
  terminated = false
  constructor() { current = this }
  postMessage(msg: any) {
    if (this.terminated) return
    if (msg.type === 'ack') { stats.acks++; stats.chunksInFlight-- }
    setTimeout(() => { if (!this.terminated) scope.onmessage?.({ data: msg }) }, 0)
  }
  terminate() { this.terminated = true }
}

beforeAll(() => {
  ;(globalThis as any).self = scope
  ;(globalThis as any).Worker = FakeWorker
})

beforeEach(async () => {
  // A browser creates a brand-new worker (fresh module state) for every import; mimic that.
  vi.resetModules()
  await import('../../workers/logParser.worker')
  vi.spyOn(console, 'info').mockImplementation(() => {})
  Object.assign(stats, { chunksInFlight: 0, maxInFlight: 0, acks: 0, chunks: 0 })
  current = null
  await Promise.all([db.logs.clear(), db.logFiles.clear(), db.fileStats.clear()])
})

const authLine = (i: number) =>
  `Aug 14 08:${String(Math.floor(i / 60) % 60).padStart(2, '0')}:${String(i % 60).padStart(2, '0')} server sshd[1234]: Failed password for root from 10.0.${(i >> 8) & 255}.${i & 255} port 52122 ssh2`

const makeFile = (name: string, content: string) => new File([content], name)

describe('import end-to-end (real worker + real importService)', () => {
  it('imports a multi-chunk file: all rows saved before it resolves, stats stored, memory bounded by backpressure', async () => {
    const n = 22_000
    const file = makeFile('auth.log', Array.from({ length: n }, (_, i) => authLine(i)).join('\n'))

    // make the database slower than the parser, so the worker really has to wait for acks
    const realBulkAdd = db.logs.bulkAdd.bind(db.logs)
    let slowCalls = 0
    vi.spyOn(db.logs, 'bulkAdd').mockImplementation(((rows: any) => {
      slowCalls++
      return new Promise((resolve, reject) => setTimeout(() => realBulkAdd(rows).then(resolve, reject), 40))
    }) as any)

    const seen: ImportProgress[] = []
    const result = await importFile(file, (p) => seen.push(p), { chunkEvents: 2000 })

    // everything was written by the time the promise resolved (the old "done overtook the chunks" bug)
    expect(await db.logs.count()).toBe(n)
    expect(result.totalEvents).toBe(n)
    expect(result.parser).toBe('linux_auth')
    expect(slowCalls).toBeGreaterThanOrEqual(10) // 22,000 events in chunks of 2,000

    // statistics were produced by the worker and persisted
    const st = await db.fileStats.get(result.fileId)
    expect(st?.totalEvents).toBe(n)
    expect(st?.failedAuth).toBe(n)
    expect(st?.top.username[0]).toEqual(['root', n])
    expect((await db.logFiles.get(result.fileId))?.eventCount).toBe(n)

    // backpressure: the worker never ran more than 3 unacknowledged chunks ahead
    expect(stats.maxInFlight).toBeLessThanOrEqual(3)
    expect(stats.acks).toBe(stats.chunks)

    // progress is monotonic and ends complete
    const saves = seen.map((p) => p.savePercent)
    expect([...saves].sort((a, b) => a - b)).toEqual(saves)
    expect(seen[seen.length - 1]).toMatchObject({ phase: 'done', savePercent: 100, parsePercent: 100 })
    expect(result.timings.saveMs).toBeGreaterThan(100) // the 40ms-per-chunk delay is accounted for as DB time
  }, 60_000)

  it('rows carry no per-row parser field any more, and keep their physical line numbers', async () => {
    const file = makeFile('auth.log', [authLine(1), '', authLine(2)].join('\n'))
    const { fileId } = await importFile(file, () => {})
    const rows = await db.logs.where('fileId').equals(fileId).toArray()
    expect(rows.map((r) => r.lineNumber)).toEqual([1, 3])
    expect('parser' in rows[0]).toBe(false)
  })

  it('cancelling mid-import rejects with CancelledError and leaves nothing behind', async () => {
    const file = makeFile('big.log', Array.from({ length: 6_000 }, (_, i) => authLine(i)).join('\n'))

    const done = importFile(file, () => {}, { chunkEvents: 300 })
    done.catch(() => {}) // avoid an unhandled-rejection warning while we wait below

    // wait until at least one chunk was saved, then cancel via the task panel's API
    for (let i = 0; i < 200 && (await db.logs.count()) === 0; i++) await new Promise((r) => setTimeout(r, 10))
    expect(await db.logs.count()).toBeGreaterThan(0)
    const task = getTasksSnapshot().find((t) => t.label.startsWith('Importing big.log'))!
    cancelTask(task.id)

    await expect(done).rejects.toBeInstanceOf(CancelledError)
    expect(await db.logs.count()).toBe(0)
    expect(await db.logFiles.count()).toBe(0)
    expect(await db.fileStats.count()).toBe(0)
    expect(getTasksSnapshot().find((t) => t.label.startsWith('Importing big.log'))).toBeUndefined()
  }, 60_000)

  it('a parse failure in the worker rejects with its message and cleans up', async () => {
    const file = makeFile('broken.json', '[ {"a": 1}, {"b": ')
    await expect(importFile(file, () => {})).rejects.toThrow(/JSON/)
    expect(await db.logFiles.count()).toBe(0)
    expect(await db.logs.count()).toBe(0)
  })

  it('imports files one after another independently (second file unaffected by the first failing)', async () => {
    const { importFiles } = await import('../importService')
    const outcomes = await importFiles(
      [makeFile('broken.json', '[ {"a": 1}, {"b": '), makeFile('ok.log', [authLine(1), authLine(2)].join('\n'))],
      () => {},
    )
    expect('error' in outcomes[0]).toBe(true)
    expect('result' in outcomes[1]).toBe(true)
    expect(await db.logs.count()).toBe(2)
  })
})
