import 'fake-indexeddb/auto'
import { describe, it, expect } from 'vitest'
import Dexie from 'dexie'

// Recreates the database exactly as the previous release (schema v1 + v2) left it in a user's browser,
// puts data in it, then opens it with the current code (v3) and checks nothing was lost.
describe('database upgrade v2 → v3', () => {
  it('keeps existing rows and files, drops the parser index, and adds fileStats', async () => {
    const old = new Dexie('LogAnalyzerDB')
    old.version(1).stores({
      logs: '++id, fileId, timestamp, severity, eventType, srcIp, dstIp, username, hostname, mark, parser',
      logFiles: '++id, name, importedAt',
      tags: '++id, &name',
      logTags: '++id, logId, tagId, [logId+tagId]',
      investigations: '++id, &code, status, priority, createdAt',
      investigationLogs: '++id, investigationId, logId, [investigationId+logId]',
      notes: '++id, logId, createdAt',
      savedFilters: '++id, &name',
      detectionRules: '++id, &name, enabled',
      settings: '++id, &key',
    })
    old.version(2).stores({ logFiles: '++id, name, importedAt' })

    await old.table('logFiles').add({ name: 'old.log', size: 10, importedAt: 1, eventCount: 3, parser: 'linux_auth', processingTimeMs: 1, storeOriginal: false, active: true })
    await old.table('logs').bulkAdd(
      [1, 2, 3].map((i) => ({
        fileId: 1, timestamp: 1_700_000_000_000 + i, severity: 'INFO', eventType: 'X', srcIp: `1.1.1.${i}`,
        mark: i === 2 ? 'REVIEW' : null, parser: 'linux_auth', rawLog: `raw ${i}`, lineNumber: i,
      })),
    )
    old.close()

    const { db } = await import('./database')
    await db.open()

    expect(db.verno).toBe(3)
    expect(await db.logs.count()).toBe(3)
    expect(await db.logFiles.count()).toBe(1)
    expect(db.tables.map((t) => t.name)).toContain('fileStats')
    expect(await db.fileStats.count()).toBe(0)

    const indexes = db.logs.schema.indexes.map((i) => i.name)
    expect(indexes).not.toContain('parser')
    expect(indexes).toEqual(expect.arrayContaining(['fileId', 'timestamp', 'srcIp', 'mark']))

    // queries on the surviving indexes still work against the migrated rows
    expect((await db.logs.where('srcIp').equals('1.1.1.2').first())?.rawLog).toBe('raw 2')
    expect(await db.logs.where('mark').equals('REVIEW').count()).toBe(1)
    expect((await db.logs.orderBy('timestamp').reverse().first())?.lineNumber).toBe(3)

    // and the app's own backfill works on data that predates statistics
    const { ensureStats, getDashboardStats } = await import('../services/statsService')
    expect(await ensureStats()).toBe(1)
    expect((await getDashboardStats()).totalEvents).toBe(3)
  })
})
