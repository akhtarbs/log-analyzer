import { db } from '../db/database'
import type { FilterGroup, LogEvent, MarkType, Severity, Tag } from '../types'
import { evalGroup } from './filterEngine'
import { createScanTicker, scanShouldStop, throwIfCancelled, type TaskHandle } from './progress'

export interface QueryOptions {
  search?: string
  quickFilter?: 'all' | Severity | 'marked' | 'unmarked' | 'suspicious'
  filterGroup?: FilterGroup | null
  /** Inclusive epoch-ms bounds on the `timestamp` field. Either side may be null for an open end. */
  timeRange?: { start: number | null; end: number | null } | null
  page: number
  pageSize: number
  sortField?: keyof LogEvent
  sortDir?: 'asc' | 'desc'
  /** Optional progress/cancel handle, used while scanning. */
  task?: TaskHandle
}

export interface QueryResult {
  rows: LogEvent[]
  total: number
}

function matchesSearch(log: LogEvent, term: string): boolean {
  const t = term.toLowerCase()
  return (
    (log.srcIp?.toLowerCase().includes(t) ?? false) ||
    (log.dstIp?.toLowerCase().includes(t) ?? false) ||
    (log.username?.toLowerCase().includes(t) ?? false) ||
    (log.hostname?.toLowerCase().includes(t) ?? false) ||
    (log.eventType?.toLowerCase().includes(t) ?? false) ||
    (log.message?.toLowerCase().includes(t) ?? false) ||
    (log.url?.toLowerCase().includes(t) ?? false) ||
    (log.userAgent?.toLowerCase().includes(t) ?? false) ||
    (log.referer?.toLowerCase().includes(t) ?? false) ||
    (log.requestBody?.toLowerCase().includes(t) ?? false) ||
    log.rawLog.toLowerCase().includes(t)
  )
}

function matchesQuickFilter(log: LogEvent, qf: QueryOptions['quickFilter']): boolean {
  if (!qf || qf === 'all') return true
  if (qf === 'marked') return log.mark !== null
  if (qf === 'unmarked') return log.mark === null
  if (qf === 'suspicious') return log.mark === 'SUSPICIOUS' || log.severity === 'HIGH' || log.severity === 'CRITICAL'
  return log.severity === qf
}

// IndexedDB range bounds — effectively -Infinity/+Infinity for a numeric key,
// used when only one side of a time range is set (open-ended).
const MIN_TIMESTAMP = -8640000000000000
const MAX_TIMESTAMP = 8640000000000000
const ALL_MARKS: Exclude<MarkType, null>[] = ['CRITICAL', 'SUSPICIOUS', 'REVIEW', 'BENIGN', 'INFO']

/**
 * Queries logs with search/filter/sort/pagination, built to stay usable on
 * millions of rows:
 *
 *  - No text search / filter / quick filter: pure index navigation. The page is
 *    read with offset+limit on the `timestamp` index, and the total comes from
 *    the per-file event counts instead of counting the table. Excluding files
 *    from analysis is applied as a lazy filter, so it no longer forces a scan.
 *  - "Marked" quick filter: reads only the (few) rows in the `mark` index.
 *  - Search / filters: unavoidably a scan of the table (there is no index for
 *    "contains"); it reports progress and can be cancelled.
 */
export async function queryLogs(opts: QueryOptions): Promise<QueryResult> {
  const { search, quickFilter, filterGroup, timeRange, page, pageSize, sortField = 'timestamp', sortDir = 'desc', task } = opts

  const files = await db.logFiles.toArray()
  const activeFileIds = new Set(files.filter((f) => f.active).map((f) => f.id!))
  const excludeInactive = activeFileIds.size < files.length
  const activeEventTotal = files.filter((f) => f.active).reduce((sum, f) => sum + f.eventCount, 0)

  const hasTimeRange = Boolean(timeRange && (timeRange.start !== null || timeRange.end !== null))
  const lo = timeRange?.start ?? MIN_TIMESTAMP
  const hi = timeRange?.end ?? MAX_TIMESTAMP

  const hasFilter = Boolean(search) || Boolean(filterGroup && filterGroup.rules.length > 0)
  const onlyMarked = quickFilter === 'marked' && !hasFilter

  // ---- "Marked" quick filter: the mark index only holds marked rows -------
  if (onlyMarked) {
    let marked = await db.logs
      .where('mark')
      .anyOf(ALL_MARKS)
      .filter((l) => activeFileIds.has(l.fileId) && (!hasTimeRange || (l.timestamp !== null && l.timestamp >= lo && l.timestamp <= hi)))
      .toArray()
    marked.sort((a, b) => ((a.timestamp ?? 0) - (b.timestamp ?? 0)) * (sortDir === 'desc' ? -1 : 1))
    return { rows: marked.slice(page * pageSize, (page + 1) * pageSize), total: marked.length }
  }

  // ---- Base ordered collection --------------------------------------------
  // With a time range, start from an indexed range query on `timestamp`.
  let collection
  if (hasTimeRange) {
    collection = db.logs.where('timestamp').between(lo, hi, true, true)
    if (sortDir === 'desc') collection = collection.reverse()
  } else {
    collection = sortDir === 'desc' ? db.logs.orderBy(sortField as string).reverse() : db.logs.orderBy(sortField as string)
  }

  const needsScan = hasFilter || Boolean(quickFilter && quickFilter !== 'all')

  // ---- Fast path: index navigation only -----------------------------------
  if (!needsScan) {
    const view = excludeInactive ? collection.filter((l) => activeFileIds.has(l.fileId)) : collection
    const total = hasTimeRange ? await view.count() : activeEventTotal
    const rows = await view.offset(page * pageSize).limit(pageSize).toArray()
    return { rows, total }
  }

  // ---- Scan path -----------------------------------------------------------
  // Dexie's cursor yields to the event loop between batches, so the UI keeps responding.
  const matched: LogEvent[] = []
  let total = 0
  const scanTotal = task ? (hasTimeRange ? await collection.count() : activeEventTotal) : 0
  const tick = createScanTicker(scanTotal, task)
  await collection.until(scanShouldStop(task)).each((log) => {
    tick()
    if (excludeInactive && !activeFileIds.has(log.fileId)) return
    let ok = true
    if (search) ok = matchesSearch(log, search)
    if (ok && quickFilter) ok = matchesQuickFilter(log, quickFilter)
    if (ok && filterGroup && filterGroup.rules.length > 0) ok = evalGroup(log, filterGroup)
    if (ok) {
      total++
      if (total > page * pageSize && matched.length < pageSize) matched.push(log)
    }
  })

  throwIfCancelled(task)
  return { rows: matched, total }
}

export async function getLogById(id: number) {
  return db.logs.get(id)
}

export async function setMark(logId: number, mark: MarkType) {
  await db.logs.update(logId, { mark })
}

export async function bulkSetMark(logIds: number[], mark: MarkType) {
  await db.transaction('rw', db.logs, async () => {
    for (const id of logIds) {
      await db.logs.update(id, { mark })
    }
  })
}

export async function addTagToLog(logId: number, tagId: number) {
  const existing = await db.logTags.where('[logId+tagId]').equals([logId, tagId]).first()
  if (!existing) {
    await db.logTags.add({ logId, tagId })
  }
}

export async function removeTagFromLog(logId: number, tagId: number) {
  await db.logTags.where('[logId+tagId]').equals([logId, tagId]).delete()
}

export async function getTagsForLog(logId: number) {
  const links = await db.logTags.where('logId').equals(logId).toArray()
  const tagIds = links.map((l) => l.tagId)
  if (tagIds.length === 0) return []
  return db.tags.where('id').anyOf(tagIds).toArray()
}

/** Batch-fetches tags for many logs at once (e.g. a table page), keyed by logId. */
export async function getTagsForLogs(logIds: number[]): Promise<Map<number, Tag[]>> {
  const result = new Map<number, Tag[]>()
  if (logIds.length === 0) return result
  const links = await db.logTags.where('logId').anyOf(logIds).toArray()
  if (links.length === 0) return result
  const tagIds = [...new Set(links.map((l) => l.tagId))]
  const tags = await db.tags.where('id').anyOf(tagIds).toArray()
  const tagById = new Map(tags.map((t) => [t.id!, t]))
  for (const link of links) {
    const tag = tagById.get(link.tagId)
    if (!tag) continue
    const arr = result.get(link.logId) ?? []
    arr.push(tag)
    result.set(link.logId, arr)
  }
  return result
}

export interface IpAnalysis {
  ip: string
  totalEvents: number
  firstSeen: number | null
  lastSeen: number | null
  failedLogin: number
  successfulLogin: number
  uniqueDestinations: number
  uniquePorts: number
}

export async function analyzeIp(ip: string): Promise<IpAnalysis> {
  const files = await db.logFiles.toArray()
  const activeFileIds = new Set(files.filter((f) => f.active).map((f) => f.id!))
  const excludeInactive = activeFileIds.size < files.length

  let totalEvents = 0
  let firstSeen: number | null = null
  let lastSeen: number | null = null
  let failedLogin = 0
  let successfulLogin = 0
  const destinations = new Set<string>()
  const ports = new Set<number>()

  // Streamed through the srcIp index: an address with a million events must not be loaded into memory.
  await db.logs
    .where('srcIp')
    .equals(ip)
    .each((e) => {
      if (excludeInactive && !activeFileIds.has(e.fileId)) return
      totalEvents++
      if (e.timestamp) {
        if (firstSeen === null || e.timestamp < firstSeen) firstSeen = e.timestamp
        if (lastSeen === null || e.timestamp > lastSeen) lastSeen = e.timestamp
      }
      if (e.eventType?.includes('LOGIN_FAILED') || e.status === 'FAILED') failedLogin++
      if (e.eventType?.includes('LOGIN_SUCCESS') || e.status === 'SUCCESS') successfulLogin++
      if (e.dstIp) destinations.add(e.dstIp)
      if (e.dstPort) ports.add(e.dstPort)
    })

  return {
    ip,
    totalEvents,
    firstSeen,
    lastSeen,
    failedLogin,
    successfulLogin,
    uniqueDestinations: destinations.size,
    uniquePorts: ports.size,
  }
}
