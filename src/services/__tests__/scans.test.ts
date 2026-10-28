import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { db } from '../../db/database'
import { queryLogs, analyzeIp } from '../logService'
import { buildFileStats, ensureStats, filesNeedingStats, getDashboardStats, getMergedActiveStats, rebuildAllStats } from '../statsService'
import { deleteLogFile, setFileActive } from '../fileService'
import { CancelledError, startTask } from '../progress'
import { StatsAccumulator } from '../../analysis/aggregate'
import type { LogEvent } from '../../types'

const T0 = 1_700_000_000_000

function makeLog(i: number, overrides: Partial<LogEvent> = {}): LogEvent {
  return {
    fileId: 1,
    timestamp: T0 + i * 1000,
    timestampRaw: null,
    hostname: null,
    logSource: null,
    eventType: 'HTTP_200',
    severity: 'INFO',
    srcIp: `10.0.0.${i % 5}`,
    srcPort: null,
    dstIp: null,
    dstPort: null,
    protocol: null,
    username: null,
    process: null,
    action: null,
    status: null,
    message: `msg ${i}`,
    rawLog: `raw ${i}`,
    mark: null,
    lineNumber: i,
    url: null,
    httpVersion: null,
    userAgent: null,
    referer: null,
    requestBody: null,
    ...overrides,
  }
}

/** Adds a file record and its rows; returns the file id. eventCount is kept consistent like the importer does. */
async function addFile(name: string, count: number, make: (i: number) => Partial<LogEvent> = () => ({}), startIndex = 0) {
  const fileId = await db.logFiles.add({
    name, size: 1, importedAt: Date.now(), eventCount: count, parser: 'generic',
    processingTimeMs: 0, storeOriginal: false, active: true,
  })
  await db.logs.bulkAdd(Array.from({ length: count }, (_, i) => makeLog(startIndex + i, { fileId, ...make(i) })))
  return fileId
}

beforeEach(async () => {
  vi.spyOn(console, 'info').mockImplementation(() => {})
  await Promise.all([db.logs.clear(), db.logFiles.clear(), db.fileStats.clear(), db.logTags.clear(), db.notes.clear(), db.investigationLogs.clear()])
})

describe('statistics backfill', () => {
  it('buildFileStats equals feeding the same rows through the accumulator, and is persisted', async () => {
    const id = await addFile('a.log', 600, (i) => ({ severity: i % 10 === 0 ? 'HIGH' : 'INFO', userAgent: i % 2 ? 'curl/8' : 'Mozilla' }))
    const file = (await db.logFiles.get(id))!
    const stats = await buildFileStats(file)

    const acc = new StatsAccumulator()
    for (const row of await db.logs.where('fileId').equals(id).toArray()) acc.add(row)
    const expected = acc.finish(id)

    expect(stats.totalEvents).toBe(600)
    expect(stats.severity.HIGH).toBe(60)
    expect(stats.top.userAgent).toEqual(expected.top.userAgent)
    expect(stats.timeline).toEqual(expected.timeline)
    expect((await db.fileStats.get(id))?.totalEvents).toBe(600)
  })

  it('ensureStats builds only what is missing and is a no-op afterwards', async () => {
    await addFile('a.log', 100)
    await addFile('b.log', 200)
    expect((await filesNeedingStats()).length).toBe(2)
    expect(await ensureStats()).toBe(2)
    expect(await ensureStats()).toBe(0)
    expect(await db.fileStats.count()).toBe(2)
  })

  it('rebuilds stats that are outdated or disagree with the file event count', async () => {
    const id = await addFile('a.log', 50)
    await ensureStats()
    await db.fileStats.update(id, { version: 0 })
    expect((await filesNeedingStats()).map((f) => f.id)).toEqual([id])
    await db.fileStats.update(id, { version: (await import('../../types')).STATS_VERSION, totalEvents: 49 })
    expect((await filesNeedingStats()).length).toBe(1)
    await ensureStats()
    expect((await db.fileStats.get(id))?.totalEvents).toBe(50)
  })

  it('rebuildAllStats recomputes everything from the logs', async () => {
    await addFile('a.log', 30)
    await ensureStats()
    await db.fileStats.clear()
    expect(await rebuildAllStats()).toBe(1)
    expect(await db.fileStats.count()).toBe(1)
  })

  it('a scan cancelled while running rejects with CancelledError and stores nothing', async () => {
    const id = await addFile('big.log', 5000)
    const file = (await db.logFiles.get(id))!
    const task = startTask('cancel mid-scan', { cancellable: true })
    const timer = setTimeout(() => task.cancel(), 1)
    await expect(buildFileStats(file, task)).rejects.toBeInstanceOf(CancelledError)
    clearTimeout(timer)
    task.finish()
    expect(await db.fileStats.count()).toBe(0)
  })
})

describe('dashboard / merged statistics', () => {
  it('only includes files that are active, and counts marked events from the mark index', async () => {
    const a = await addFile('a.log', 100, () => ({ severity: 'HIGH', srcIp: '1.1.1.1' }))
    const b = await addFile('b.log', 40, () => ({ severity: 'CRITICAL', srcIp: '2.2.2.2' }), 1000)
    await ensureStats()
    await db.logs.where('fileId').equals(a).limit(3).modify({ mark: 'SUSPICIOUS' })
    await db.logs.where('fileId').equals(b).limit(2).modify({ mark: 'REVIEW' })

    let d = await getDashboardStats()
    expect(d.totalEvents).toBe(140)
    expect(d.high).toBe(100)
    expect(d.critical).toBe(40)
    expect(d.marked).toBe(5)
    expect(d.topSourceIps[0]).toEqual({ key: '1.1.1.1', count: 100 })

    await setFileActive(b, false)
    d = await getDashboardStats()
    expect(d.totalEvents).toBe(100)
    expect(d.critical).toBe(0)
    expect(d.marked).toBe(3)
    expect((await getMergedActiveStats()).fileCount).toBe(1)
  })

  it('timeline buckets follow the selected display timezone', async () => {
    await addFile('a.log', 10)
    await ensureStats()
    const utc = await getDashboardStats(0)
    const plus = await getDashboardStats(330)
    expect(utc.timeline.reduce((s, b) => s + b.count, 0)).toBe(10)
    expect(plus.timeline.reduce((s, b) => s + b.count, 0)).toBe(10)
  })
})

describe('queryLogs', () => {
  it('fast path: pages newest-first and reports the total without scanning', async () => {
    await addFile('a.log', 250)
    const page = await queryLogs({ page: 0, pageSize: 100, sortDir: 'desc' })
    expect(page.total).toBe(250)
    expect(page.rows).toHaveLength(100)
    expect(page.rows[0].timestamp!).toBeGreaterThan(page.rows[99].timestamp!)
    const last = await queryLogs({ page: 2, pageSize: 100, sortDir: 'desc' })
    expect(last.rows).toHaveLength(50)
  })

  it('excluding a file hides its rows and fixes the total — without needing a text search/scan', async () => {
    const a = await addFile('a.log', 120)
    const b = await addFile('b.log', 80, () => ({}), 5000)
    await setFileActive(b, false)

    const p0 = await queryLogs({ page: 0, pageSize: 100 })
    const p1 = await queryLogs({ page: 1, pageSize: 100 })
    expect(p0.total).toBe(120)
    expect(p0.rows).toHaveLength(100)
    expect(p1.rows).toHaveLength(20) // offset is applied after the exclusion filter
    expect([...p0.rows, ...p1.rows].every((r) => r.fileId === a)).toBe(true)
  })

  it('time range limits rows and total (inclusive), also together with an excluded file', async () => {
    await addFile('a.log', 100)
    const b = await addFile('b.log', 100, () => ({}), 0)
    const start = T0 + 10 * 1000
    const end = T0 + 19 * 1000

    let res = await queryLogs({ page: 0, pageSize: 100, sortDir: 'asc', timeRange: { start, end } })
    expect(res.total).toBe(20) // 10 timestamps x 2 files
    await setFileActive(b, false)
    res = await queryLogs({ page: 0, pageSize: 100, sortDir: 'asc', timeRange: { start, end } })
    expect(res.total).toBe(10)
    expect(res.rows[0].timestamp).toBe(start)
    expect(res.rows[9].timestamp).toBe(end)
  })

  it('"Marked" quick filter returns only marked rows of active files, sorted by time', async () => {
    const a = await addFile('a.log', 50)
    const b = await addFile('b.log', 50, () => ({}), 100)
    await db.logs.where('fileId').equals(a).filter((l) => l.lineNumber % 10 === 0).modify({ mark: 'SUSPICIOUS' })
    await db.logs.where('fileId').equals(b).filter((l) => l.lineNumber % 25 === 0).modify({ mark: 'BENIGN' })

    let res = await queryLogs({ page: 0, pageSize: 100, quickFilter: 'marked', sortDir: 'asc' })
    expect(res.total).toBe(5 + 2) // a: lines 0,10,20,30,40 — b: lines 100,125
    const ts = res.rows.map((r) => r.timestamp!)
    expect([...ts].sort((x, y) => x - y)).toEqual(ts)

    await setFileActive(b, false)
    res = await queryLogs({ page: 0, pageSize: 100, quickFilter: 'marked' })
    expect(res.total).toBe(5)
  })

  it('search scan returns the matches, honours exclusion, and can be cancelled', async () => {
    const a = await addFile('a.log', 2000, (i) => ({ message: i % 100 === 0 ? 'needle' : 'hay' }))
    const b = await addFile('b.log', 500, (i) => ({ message: i % 100 === 0 ? 'needle' : 'hay' }), 9000)
    const t1 = startTask('search ok')
    let ok = await queryLogs({ page: 0, pageSize: 100, search: 'needle', task: t1 })
    t1.finish()
    expect(ok.total).toBe(25)
    await setFileActive(b, false)
    ok = await queryLogs({ page: 0, pageSize: 100, search: 'needle' })
    expect(ok.total).toBe(20)
    expect(ok.rows.every((r) => r.fileId === a)).toBe(true)

    const t2 = startTask('search cancelled', { cancellable: true })
    t2.cancel()
    await expect(queryLogs({ page: 0, pageSize: 100, search: 'needle', task: t2 })).rejects.toBeInstanceOf(CancelledError)
    t2.finish()
  })
})

describe('deleteLogFile', () => {
  it('removes every row across several batches, plus stats, notes and tags attached to those rows', async () => {
    // Small data + small batch size: exercises the multi-batch loop. (fake-indexeddb deletes in
    // quadratic time, so large volumes here would only measure the emulator, not the code.)
    const a = await addFile('a.log', 1500)
    const b = await addFile('b.log', 10, () => ({}), 50_000)
    await ensureStats()
    const aRow = (await db.logs.where('fileId').equals(a).first())!
    const bRow = (await db.logs.where('fileId').equals(b).first())!
    await db.notes.bulkAdd([{ logId: aRow.id!, text: 'x', createdAt: 1 }, { logId: bRow.id!, text: 'keep', createdAt: 1 }])
    await db.logTags.add({ logId: aRow.id!, tagId: 1 })

    const task = startTask('delete')
    const updates: string[] = []
    const origUpdate = task.update
    task.update = (p, d) => { if (d) updates.push(d); origUpdate(p, d) }
    await deleteLogFile(a, task, 500)
    task.finish()

    expect(updates).toHaveLength(3) // 1500 rows / batch of 500
    expect(await db.logs.where('fileId').equals(a).count()).toBe(0)
    expect(await db.logs.where('fileId').equals(b).count()).toBe(10)
    expect(await db.logFiles.get(a)).toBeUndefined()
    expect(await db.fileStats.get(a)).toBeUndefined()
    expect(await db.fileStats.get(b)).toBeDefined()
    expect((await db.notes.toArray()).map((n) => n.text)).toEqual(['keep'])
    expect(await db.logTags.count()).toBe(0)
  }, 30_000)

  it('deleting a file with no rows just removes its record', async () => {
    const id = await db.logFiles.add({ name: 'empty', size: 0, importedAt: 1, eventCount: 0, parser: 'generic', processingTimeMs: 0, storeOriginal: false, active: true })
    await deleteLogFile(id)
    expect(await db.logFiles.get(id)).toBeUndefined()
  })
})

describe('analyzeIp', () => {
  it('streams one address and ignores excluded files', async () => {
    const a = await addFile('a.log', 100, () => ({ srcIp: '7.7.7.7', eventType: 'SSH_LOGIN_FAILED', dstIp: '9.9.9.9', dstPort: 22 }))
    const b = await addFile('b.log', 50, () => ({ srcIp: '7.7.7.7' }), 500)
    let r = await analyzeIp('7.7.7.7')
    expect(r.totalEvents).toBe(150)
    expect(r.failedLogin).toBe(100)
    await setFileActive(b, false)
    r = await analyzeIp('7.7.7.7')
    expect(r.totalEvents).toBe(100)
    expect(r.uniqueDestinations).toBe(1)
    expect(a).toBeGreaterThan(0)
  })
})

describe('runDetectionRules (streams from the database)', () => {
  const rule = {
    name: 'burst', description: '', enabled: true, builtin: false, conditionEventType: 'SSH_LOGIN_FAILED',
    groupByField: 'srcIp' as const, thresholdCount: 5, windowSeconds: 60, resultSeverity: 'HIGH' as const,
    resultTag: 'BRUTE_FORCE', createdAt: 1,
  }

  it('finds bursts across files in time order and ignores excluded files', async () => {
    const a = await addFile('a.log', 10, () => ({ eventType: 'SSH_LOGIN_FAILED', srcIp: '6.6.6.6' }))
    const b = await addFile('b.log', 10, () => ({ eventType: 'SSH_LOGIN_FAILED', srcIp: '8.8.8.8' }), 100)
    const { runDetectionRules } = await import('../ruleService')

    let findings = await runDetectionRules([rule])
    expect(findings.map((f) => f.groupValue).sort()).toEqual(['6.6.6.6', '6.6.6.6', '8.8.8.8', '8.8.8.8'])

    await setFileActive(b, false)
    findings = await runDetectionRules([rule])
    expect(findings.every((f) => f.groupValue === '6.6.6.6')).toBe(true)
    expect(a).toBeGreaterThan(0)
  })

  it('can be cancelled', async () => {
    await addFile('a.log', 3000, () => ({ eventType: 'SSH_LOGIN_FAILED', srcIp: '6.6.6.6' }))
    const { runDetectionRules } = await import('../ruleService')
    const task = startTask('rules', { cancellable: true })
    task.cancel()
    await expect(runDetectionRules([rule], task)).rejects.toBeInstanceOf(CancelledError)
    task.finish()
  })
})
