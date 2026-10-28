// ---------------------------------------------------------------------------
// Pre-computed statistics.
//
// A StatsAccumulator sees every event exactly once (during import, inside the
// parser worker — or during a one-off backfill for files imported earlier) and
// produces a compact FileStats record. Dashboard and Analysis then merge those
// small records instead of rescanning millions of log rows.
//
// Counting is exact. Only if a single field has more than PRUNE_ABOVE distinct
// values (e.g. unique URLs) the long tail is pruned, so the *top* entries
// remain right while rare values may be undercounted or dropped.
// ---------------------------------------------------------------------------
import {
  STATS_VERSION,
  type FileStats,
  type IpEntry,
  type LogEvent,
  type PayloadCounts,
  type Severity,
  type TopList,
} from '../types'
import { classifyUserAgent, detectPayloadTags, extractPath, isSensitivePath, statusClass } from './indicators'

export type CountableEvent = Pick<
  LogEvent,
  'timestamp' | 'severity' | 'srcIp' | 'dstIp' | 'username' | 'eventType' | 'userAgent' | 'url' | 'status' | 'action'
> & { requestBody?: string | null }

const MAX_KEY_LENGTH = 512
export const TOP_K_STORED = 1000
const PRUNE_ABOVE = 50_000
const PRUNE_TO = 10_000

const SEVERITIES: Severity[] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO']
export const TOP_FIELDS = ['srcIp', 'dstIp', 'username', 'eventType', 'userAgent', 'url', 'status', 'action'] as const
export type TopField = (typeof TOP_FIELDS)[number]
// srcIp is counted by the per-IP table below, everything else by a plain counter.
const COUNTER_FIELDS = TOP_FIELDS.filter((f) => f !== 'srcIp' && f !== 'url') as Exclude<TopField, 'srcIp' | 'url'>[]

class Counter {
  private map = new Map<string, number>()

  add(value: string | null) {
    if (!value) return
    const key = value.length > MAX_KEY_LENGTH ? value.slice(0, MAX_KEY_LENGTH) : value
    this.map.set(key, (this.map.get(key) ?? 0) + 1)
    if (this.map.size > PRUNE_ABOVE) this.prune()
  }

  private prune() {
    const kept = [...this.map.entries()].sort((a, b) => b[1] - a[1]).slice(0, PRUNE_TO)
    this.map = new Map(kept)
  }

  top(k: number): TopList {
    return [...this.map.entries()].sort((a, b) => b[1] - a[1]).slice(0, k)
  }
}

class IpTable {
  private map = new Map<string, IpEntry>()

  add(ip: string, err: boolean, tool: string | null, sens: boolean, inj: boolean) {
    const key = ip.length > MAX_KEY_LENGTH ? ip.slice(0, MAX_KEY_LENGTH) : ip
    let e = this.map.get(key)
    if (!e) {
      e = { ip: key, n: 0, err: 0, auto: 0, sens: 0, inj: 0, tool: null }
      this.map.set(key, e)
      if (this.map.size > PRUNE_ABOVE) this.prune()
    }
    e.n++
    if (err) e.err++
    if (tool) {
      e.auto++
      if (!e.tool) e.tool = tool
    }
    if (sens) e.sens++
    if (inj) e.inj++
  }

  private prune() {
    const kept = [...this.map.values()].sort((a, b) => b.n - a.n).slice(0, PRUNE_TO)
    this.map = new Map(kept.map((e) => [e.ip, e]))
  }

  top(k: number): IpEntry[] {
    return [...this.map.values()].sort((a, b) => b.n - a.n).slice(0, k).map((e) => ({ ...e }))
  }
}

export function isFailedAuth(e: Pick<LogEvent, 'eventType' | 'status'>): boolean {
  return Boolean(e.eventType?.includes('LOGIN_FAILED')) || e.status === 'FAILED'
}

export class StatsAccumulator {
  private total = 0
  private failedAuth = 0
  private withUserAgent = 0
  private automated = 0
  private sensitive = 0
  private payload: PayloadCounts = { SQL_INJECTION: 0, COMMAND_INJECTION: 0, XSS: 0 }
  private severity: Record<Severity, number> = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, INFO: 0 }
  /** minute → [total, 2xx, 3xx, 4xx, 5xx] */
  private minutes = new Map<number, number[]>()
  private ips = new IpTable()
  private url = new Counter()
  private sensitivePaths = new Counter()
  private counters = {
    dstIp: new Counter(),
    username: new Counter(),
    eventType: new Counter(),
    userAgent: new Counter(),
    status: new Counter(),
    action: new Counter(),
  }

  add(e: CountableEvent) {
    this.total++
    if (e.severity in this.severity) this.severity[e.severity]++
    if (isFailedAuth(e)) this.failedAuth++

    const cls = statusClass(e.status)
    if (e.timestamp !== null) {
      const minute = Math.floor(e.timestamp / 60000)
      let row = this.minutes.get(minute)
      if (!row) {
        row = [0, 0, 0, 0, 0]
        this.minutes.set(minute, row)
      }
      row[0]++
      if (cls !== null) row[cls - 1]++
    }

    let tool: string | null = null
    if (e.userAgent) {
      this.withUserAgent++
      tool = classifyUserAgent(e.userAgent)
      if (tool) this.automated++
    }

    let sens = false
    if (e.url) {
      const path = extractPath(e.url)
      this.url.add(path)
      sens = isSensitivePath(path)
      if (sens) {
        this.sensitive++
        this.sensitivePaths.add(path)
      }
    }

    const tags = e.url || e.requestBody ? detectPayloadTags(e.url, e.requestBody ?? null) : []
    for (const t of tags) this.payload[t]++

    if (e.srcIp) this.ips.add(e.srcIp, cls === 4 || cls === 5, tool, sens, tags.length > 0)
    for (const f of COUNTER_FIELDS) this.counters[f].add(e[f])
  }

  get count() {
    return this.total
  }

  finish(fileId: number): FileStats {
    const sorted = [...this.minutes.entries()].sort((a, b) => a[0] - b[0])
    const timeline = sorted.map(([m, r]) => [m, r[0]]) as [number, number][]
    const timelineStatus = sorted
      .filter(([, r]) => r[1] + r[2] + r[3] + r[4] > 0)
      .map(([m, r]) => [m, r[1], r[2], r[3], r[4]]) as [number, number, number, number, number][]

    const ips = this.ips.top(TOP_K_STORED)
    const top: FileStats['top'] = {
      srcIp: ips.map((e) => [e.ip, e.n] as [string, number]),
      url: this.url.top(TOP_K_STORED),
      dstIp: this.counters.dstIp.top(TOP_K_STORED),
      username: this.counters.username.top(TOP_K_STORED),
      eventType: this.counters.eventType.top(TOP_K_STORED),
      userAgent: this.counters.userAgent.top(TOP_K_STORED),
      status: this.counters.status.top(TOP_K_STORED),
      action: this.counters.action.top(TOP_K_STORED),
    }
    return {
      fileId,
      version: STATS_VERSION,
      computedAt: Date.now(),
      totalEvents: this.total,
      severity: { ...this.severity },
      failedAuth: this.failedAuth,
      withUserAgent: this.withUserAgent,
      automated: this.automated,
      sensitive: this.sensitive,
      sensitivePaths: this.sensitivePaths.top(200),
      payload: { ...this.payload },
      ips,
      timeline,
      timelineStatus,
      top,
    }
  }
}

// ---------------------------------------------------------------------------
// Merging (what Dashboard / Analysis read)
// ---------------------------------------------------------------------------

export interface MergedStats {
  fileCount: number
  totalEvents: number
  severity: Record<Severity, number>
  failedAuth: number
  withUserAgent: number
  automated: number
  sensitive: number
  sensitivePaths: TopList
  payload: PayloadCounts
  ips: IpEntry[]
  /** Events per UTC minute, ascending. */
  timeline: [number, number][]
  /** [minute, 2xx, 3xx, 4xx, 5xx], ascending. */
  timelineStatus: [number, number, number, number, number][]
  top: Record<TopField, TopList>
}

function sumInto(target: Map<string, number>, list: TopList | undefined) {
  for (const [value, count] of list ?? []) target.set(value, (target.get(value) ?? 0) + count)
}

const byCountDesc = (a: [string, number], b: [string, number]) => b[1] - a[1]

export function mergeStats(list: FileStats[], keep = TOP_K_STORED): MergedStats {
  const severity: Record<Severity, number> = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, INFO: 0 }
  const payload: PayloadCounts = { SQL_INJECTION: 0, COMMAND_INJECTION: 0, XSS: 0 }
  let totalEvents = 0
  let failedAuth = 0
  let withUserAgent = 0
  let automated = 0
  let sensitive = 0
  const minutes = new Map<number, number>()
  const statusMinutes = new Map<number, number[]>()
  const tops = {} as Record<TopField, Map<string, number>>
  for (const f of TOP_FIELDS) tops[f] = new Map()
  const sensitivePaths = new Map<string, number>()
  const ips = new Map<string, IpEntry>()

  for (const s of list) {
    totalEvents += s.totalEvents
    failedAuth += s.failedAuth
    withUserAgent += s.withUserAgent ?? 0
    automated += s.automated ?? 0
    sensitive += s.sensitive ?? 0
    for (const sev of SEVERITIES) severity[sev] += s.severity[sev] ?? 0
    payload.SQL_INJECTION += s.payload?.SQL_INJECTION ?? 0
    payload.COMMAND_INJECTION += s.payload?.COMMAND_INJECTION ?? 0
    payload.XSS += s.payload?.XSS ?? 0
    for (const [m, c] of s.timeline) minutes.set(m, (minutes.get(m) ?? 0) + c)
    for (const [m, a, b, c, d] of s.timelineStatus ?? []) {
      const row = statusMinutes.get(m)
      if (row) {
        row[0] += a; row[1] += b; row[2] += c; row[3] += d
      } else statusMinutes.set(m, [a, b, c, d])
    }
    for (const f of TOP_FIELDS) sumInto(tops[f], s.top[f])
    sumInto(sensitivePaths, s.sensitivePaths)
    for (const e of s.ips ?? []) {
      const cur = ips.get(e.ip)
      if (cur) {
        cur.n += e.n; cur.err += e.err; cur.auto += e.auto; cur.sens += e.sens; cur.inj += e.inj
        if (!cur.tool) cur.tool = e.tool
      } else ips.set(e.ip, { ...e })
    }
  }

  const top = {} as Record<TopField, TopList>
  for (const f of TOP_FIELDS) top[f] = [...tops[f].entries()].sort(byCountDesc).slice(0, keep)
  const mergedIps = [...ips.values()].sort((a, b) => b.n - a.n).slice(0, keep)
  // The per-IP table is the source of truth for the source-IP ranking, so both agree.
  top.srcIp = mergedIps.map((e) => [e.ip, e.n] as [string, number])

  return {
    fileCount: list.length,
    totalEvents,
    severity,
    failedAuth,
    withUserAgent,
    automated,
    sensitive,
    sensitivePaths: [...sensitivePaths.entries()].sort(byCountDesc).slice(0, 200),
    payload,
    ips: mergedIps,
    timeline: [...minutes.entries()].sort((a, b) => a[0] - b[0]) as [number, number][],
    timelineStatus: [...statusMinutes.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([m, r]) => [m, r[0], r[1], r[2], r[3]]) as [number, number, number, number, number][],
    top,
  }
}

/** Requests per HTTP status class, derived from the (low-cardinality, therefore exact) status counts. */
export function statusClassTotals(merged: Pick<MergedStats, 'top'>): { c2: number; c3: number; c4: number; c5: number; http: number } {
  const t = { c2: 0, c3: 0, c4: 0, c5: 0, http: 0 }
  for (const [status, count] of merged.top.status) {
    const c = statusClass(status)
    if (c === null) continue
    t.http += count
    if (c === 2) t.c2 += count
    else if (c === 3) t.c3 += count
    else if (c === 4) t.c4 += count
    else t.c5 += count
  }
  return t
}

// ---------------------------------------------------------------------------
// Timeline helpers
// ---------------------------------------------------------------------------

export interface TimelineBucket {
  /** Bucket start as epoch ms (UTC instant). */
  startMs: number
  count: number
}

/**
 * Re-buckets per-minute counts into larger buckets whose boundaries are aligned
 * to the *display* timezone (offsetMinutes east of UTC), so e.g. hourly bars
 * start on the hour in the timezone the person selected.
 */
export function rebucketTimeline(timeline: [number, number][], bucketMinutes: number, offsetMinutes = 0): TimelineBucket[] {
  const buckets = new Map<number, number>()
  for (const [minute, count] of timeline) {
    const idx = Math.floor((minute + offsetMinutes) / bucketMinutes)
    buckets.set(idx, (buckets.get(idx) ?? 0) + count)
  }
  return [...buckets.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([idx, count]) => ({ startMs: (idx * bucketMinutes - offsetMinutes) * 60000, count }))
}

export interface StackedBucket {
  startMs: number
  /** Bucket length in ms, so callers can compute the inclusive end (startMs + durationMs - 1). */
  durationMs: number
  total: number
  c2: number
  c3: number
  c4: number
  c5: number
  /** Events without an HTTP status (SSH logins, app logs, ...). */
  other: number
}

/** Longest run of empty buckets that will be filled in with zeros; beyond that the gaps are left out. */
const MAX_FILLED_BUCKETS = 20_000

/**
 * Per-bucket totals split by HTTP status class, for the timeline chart. Empty buckets between the first
 * and last event are included as zeros so the time axis stays evenly spaced.
 */
export function rebucketStacked(
  timeline: [number, number][],
  timelineStatus: [number, number, number, number, number][],
  bucketMinutes: number,
  offsetMinutes = 0,
): StackedBucket[] {
  const rows = new Map<number, number[]>() // idx → [total, c2, c3, c4, c5]
  const row = (idx: number) => {
    let r = rows.get(idx)
    if (!r) {
      r = [0, 0, 0, 0, 0]
      rows.set(idx, r)
    }
    return r
  }
  for (const [minute, count] of timeline) row(Math.floor((minute + offsetMinutes) / bucketMinutes))[0] += count
  for (const [minute, a, b, c, d] of timelineStatus) {
    const r = row(Math.floor((minute + offsetMinutes) / bucketMinutes))
    r[1] += a; r[2] += b; r[3] += c; r[4] += d
  }
  if (rows.size === 0) return []

  const idxs = [...rows.keys()].sort((a, b) => a - b)
  const first = idxs[0]
  const last = idxs[idxs.length - 1]
  const toBucket = (idx: number): StackedBucket => {
    const r = rows.get(idx) ?? [0, 0, 0, 0, 0]
    return {
      startMs: (idx * bucketMinutes - offsetMinutes) * 60000,
      durationMs: bucketMinutes * 60000,
      total: r[0],
      c2: r[1],
      c3: r[2],
      c4: r[3],
      c5: r[4],
      other: Math.max(0, r[0] - r[1] - r[2] - r[3] - r[4]),
    }
  }
  if (last - first + 1 > MAX_FILLED_BUCKETS) return idxs.map(toBucket)
  const out: StackedBucket[] = []
  for (let i = first; i <= last; i++) out.push(toBucket(i))
  return out
}

/** Selectable bucket sizes, in minutes. */
export const BUCKET_OPTIONS = [1, 5, 15, 30, 60, 360, 1440] as const
const NICE_BUCKETS = [1, 5, 10, 15, 30, 60, 180, 360, 720, 1440, 10080, 43200]

/** Number of minutes from the first to the last recorded event (inclusive). */
export function timelineSpanMinutes(timeline: [number, number][]): number {
  return timeline.length === 0 ? 0 : timeline[timeline.length - 1][0] - timeline[0][0] + 1
}

/** Picks a bucket size (in minutes) so the chart has at most ~maxBars bars. */
export function chooseBucketMinutes(timeline: [number, number][], maxBars = 120): number {
  if (timeline.length === 0) return 60
  const span = timelineSpanMinutes(timeline)
  return NICE_BUCKETS.find((b) => span / b <= maxBars) ?? NICE_BUCKETS[NICE_BUCKETS.length - 1]
}
