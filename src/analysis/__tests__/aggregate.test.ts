import { describe, it, expect } from 'vitest'
import {
  StatsAccumulator,
  mergeStats,
  rebucketTimeline,
  rebucketStacked,
  statusClassTotals,
  chooseBucketMinutes,
  TOP_K_STORED,
} from '../aggregate'
import { STATS_VERSION } from '../../types'
import type { LogEvent } from '../../types'

type Ev = Parameters<StatsAccumulator['add']>[0]
const ev = (o: Partial<Ev> = {}): Ev => ({
  timestamp: Date.UTC(2026, 7, 4, 1, 0, 0),
  severity: 'INFO',
  srcIp: null, dstIp: null, username: null, eventType: null, userAgent: null, url: null, status: null, action: null,
  ...o,
})

describe('StatsAccumulator', () => {
  it('counts totals, severities and failed authentication', () => {
    const acc = new StatsAccumulator()
    acc.add(ev({ severity: 'HIGH', eventType: 'SSH_LOGIN_FAILED' }))
    acc.add(ev({ severity: 'INFO', status: 'FAILED' }))
    acc.add(ev({ severity: 'INFO', eventType: 'HTTP_200' }))
    const s = acc.finish(7)
    expect(s.fileId).toBe(7)
    expect(s.totalEvents).toBe(3)
    expect(s.severity.HIGH).toBe(1)
    expect(s.severity.INFO).toBe(2)
    expect(s.failedAuth).toBe(2)
  })

  it('ranks top values by count and ignores null/empty values', () => {
    const acc = new StatsAccumulator()
    for (let i = 0; i < 5; i++) acc.add(ev({ srcIp: '1.1.1.1', userAgent: 'curl/8.0' }))
    for (let i = 0; i < 2; i++) acc.add(ev({ srcIp: '2.2.2.2', userAgent: 'Mozilla/5.0' }))
    acc.add(ev({ srcIp: null, userAgent: '' }))
    const s = acc.finish(1)
    expect(s.top.srcIp).toEqual([['1.1.1.1', 5], ['2.2.2.2', 2]])
    expect(s.top.userAgent[0]).toEqual(['curl/8.0', 5])
    expect(s.top.userAgent.length).toBe(2)
  })

  it('builds a per-minute timeline in ascending order and skips null timestamps', () => {
    const acc = new StatsAccumulator()
    const t = Date.UTC(2026, 7, 4, 1, 0, 0)
    acc.add(ev({ timestamp: t + 61_000 }))
    acc.add(ev({ timestamp: t }))
    acc.add(ev({ timestamp: t + 5_000 }))
    acc.add(ev({ timestamp: null }))
    const s = acc.finish(1)
    const m0 = Math.floor(t / 60000)
    expect(s.timeline).toEqual([[m0, 2], [m0 + 1, 1]])
  })

  it('truncates very long values instead of storing them whole', () => {
    const acc = new StatsAccumulator()
    acc.add(ev({ url: '/a' + 'x'.repeat(5000) }))
    expect(acc.finish(1).top.url[0][0].length).toBe(512)
  })

  it('caps stored top lists and keeps heavy hitters when there are huge numbers of distinct values', () => {
    const acc = new StatsAccumulator()
    for (let i = 0; i < 300; i++) acc.add(ev({ srcIp: '9.9.9.9' }))
    // 60k distinct one-off values forces at least one internal prune
    for (let i = 0; i < 60_000; i++) acc.add(ev({ srcIp: `10.${i >> 8}.${i & 255}.1` }))
    const s = acc.finish(1)
    expect(s.top.srcIp.length).toBeLessThanOrEqual(TOP_K_STORED)
    expect(s.top.srcIp[0]).toEqual(['9.9.9.9', 300])
  })
})

describe('mergeStats', () => {
  it('sums totals, severities, timelines and top lists across files', () => {
    const a = new StatsAccumulator()
    const b = new StatsAccumulator()
    const t = Date.UTC(2026, 7, 4, 1, 0, 0)
    a.add(ev({ srcIp: '1.1.1.1', severity: 'HIGH', timestamp: t }))
    a.add(ev({ srcIp: '2.2.2.2', timestamp: t }))
    b.add(ev({ srcIp: '1.1.1.1', severity: 'HIGH', timestamp: t }))
    const m = mergeStats([a.finish(1), b.finish(2)])
    expect(m.fileCount).toBe(2)
    expect(m.totalEvents).toBe(3)
    expect(m.severity.HIGH).toBe(2)
    expect(m.top.srcIp).toEqual([['1.1.1.1', 2], ['2.2.2.2', 1]])
    expect(m.timeline).toEqual([[Math.floor(t / 60000), 3]])
  })

  it('merging nothing gives empty stats', () => {
    const m = mergeStats([])
    expect(m.totalEvents).toBe(0)
    expect(m.timeline).toEqual([])
    expect(m.top.srcIp).toEqual([])
  })
})

describe('rebucketTimeline', () => {
  const t = Date.UTC(2026, 7, 4, 0, 30, 0) // 00:30 UTC
  const minute = Math.floor(t / 60000)

  it('groups minutes into hourly UTC buckets', () => {
    const out = rebucketTimeline([[minute, 2], [minute + 20, 3], [minute + 40, 4]], 60)
    expect(out).toEqual([
      { startMs: Date.UTC(2026, 7, 4, 0, 0, 0), count: 5 },
      { startMs: Date.UTC(2026, 7, 4, 1, 0, 0), count: 4 },
    ])
  })

  it('aligns bucket boundaries to the display timezone, not UTC', () => {
    // 00:30 UTC == 06:00 in UTC+5:30, so local hourly buckets start at :30 past the UTC hour.
    const events: [number, number][] = [[minute, 1], [minute + 59, 1], [minute + 60, 1]] // 06:00, 06:59, 07:00 local
    const local = rebucketTimeline(events, 60, 330)
    expect(local[0]).toEqual({ startMs: Date.UTC(2026, 7, 4, 0, 30, 0), count: 2 })
    expect(local[1]).toEqual({ startMs: Date.UTC(2026, 7, 4, 1, 30, 0), count: 1 })

    // The same events (00:30, 01:29, 01:30 UTC) bucketed in plain UTC split 1 | 2 instead of 2 | 1,
    // proving the display offset really changes the boundaries.
    const utc = rebucketTimeline(events, 60, 0)
    expect(utc[0]).toEqual({ startMs: Date.UTC(2026, 7, 4, 0, 0, 0), count: 1 })
    expect(utc[1]).toEqual({ startMs: Date.UTC(2026, 7, 4, 1, 0, 0), count: 2 })
  })
})

describe('chooseBucketMinutes', () => {
  it('uses fine buckets for short spans and coarse buckets for long spans', () => {
    const short: [number, number][] = [[0, 1], [59, 1]]
    const long: [number, number][] = [[0, 1], [60 * 24 * 90, 1]] // 90 days
    expect(chooseBucketMinutes(short)).toBeLessThanOrEqual(1)
    expect(chooseBucketMinutes(long)).toBeGreaterThanOrEqual(1440)
    expect(chooseBucketMinutes([])).toBe(60)
  })
})

// keep the import used for type-level coverage of the exported event shape
const _typecheck: Pick<LogEvent, 'severity'> = { severity: 'INFO' }
void _typecheck


// ---------------------------------------------------------------------------
// Indicator statistics (stage C)
// ---------------------------------------------------------------------------
const T0 = Date.UTC(2026, 7, 4, 1, 0, 0)
const http = (o: Partial<Ev> = {}): Ev =>
  ev({ eventType: 'HTTP_200', status: '200', action: 'GET', url: '/index.html', userAgent: 'Mozilla/5.0 (X11; Ubuntu) Firefox/28.0', timestamp: T0, ...o })

describe('StatsAccumulator — indicators', () => {
  it('is on stats version 2 so earlier files get rebuilt', () => {
    expect(STATS_VERSION).toBe(2)
    expect(new StatsAccumulator().finish(1).version).toBe(2)
  })

  it('counts automated clients against events that carry a user agent', () => {
    const acc = new StatsAccumulator()
    acc.add(http())
    acc.add(http({ userAgent: 'curl/8.4.0' }))
    acc.add(http({ userAgent: 'sqlmap/1.7' }))
    acc.add(http({ userAgent: null })) // no UA at all: not part of the denominator
    const s = acc.finish(1)
    expect(s.withUserAgent).toBe(3)
    expect(s.automated).toBe(2)
  })

  it('counts URLs without their query string', () => {
    const acc = new StatsAccumulator()
    acc.add(http({ url: '/search?q=a' }))
    acc.add(http({ url: '/search?q=b&page=2' }))
    acc.add(http({ url: '/about' }))
    expect(acc.finish(1).top.url).toEqual([['/search', 2], ['/about', 1]])
  })

  it('counts sensitive paths and remembers which ones', () => {
    const acc = new StatsAccumulator()
    for (let i = 0; i < 3; i++) acc.add(http({ url: '/.env' }))
    acc.add(http({ url: '/wp-login.php?redirect=1' }))
    acc.add(http({ url: '/index.html' }))
    const s = acc.finish(1)
    expect(s.sensitive).toBe(4)
    expect(s.sensitivePaths).toEqual([['/.env', 3], ['/wp-login.php', 1]])
  })

  it('counts injection-style payloads per category', () => {
    const acc = new StatsAccumulator()
    acc.add(http({ url: "/item?id=1' OR 1=1--" }))
    acc.add(http({ url: '/item?id=1%27+UNION+SELECT+1,2' }))
    acc.add(http({ url: '/search?q=%3Cscript%3Ealert(1)%3C/script%3E' }))
    acc.add(http({ url: '/index.html' }))
    const s = acc.finish(1)
    expect(s.payload.SQL_INJECTION).toBe(2)
    expect(s.payload.XSS).toBe(1)
    expect(s.payload.COMMAND_INJECTION).toBe(0)
  })

  it('builds a per-IP table with error, automated, sensitive and payload counts', () => {
    const acc = new StatsAccumulator()
    for (let i = 0; i < 6; i++) acc.add(http({ srcIp: '9.9.9.9', status: '404', userAgent: 'sqlmap/1.7', url: '/.env' }))
    acc.add(http({ srcIp: '9.9.9.9', status: '200', userAgent: 'sqlmap/1.7', url: "/x?id=1' or 1=1--" }))
    acc.add(http({ srcIp: '1.1.1.1', status: '200' }))
    const s = acc.finish(1)
    const bad = s.ips.find((e) => e.ip === '9.9.9.9')!
    expect(bad).toEqual({ ip: '9.9.9.9', n: 7, err: 6, auto: 7, sens: 6, inj: 1, tool: 'sqlmap' })
    expect(s.ips[0].ip).toBe('9.9.9.9') // busiest first
    expect(s.top.srcIp[0]).toEqual(['9.9.9.9', 7]) // the srcIp ranking comes from the same table
    expect(s.ips.find((e) => e.ip === '1.1.1.1')).toMatchObject({ n: 1, err: 0, auto: 0, sens: 0, inj: 0, tool: null })
  })

  it('records HTTP status classes per minute, sparsely', () => {
    const acc = new StatsAccumulator()
    acc.add(http({ status: '200', timestamp: T0 }))
    acc.add(http({ status: '404', timestamp: T0 + 1000 }))
    acc.add(http({ status: '500', timestamp: T0 + 61_000 }))
    acc.add(ev({ timestamp: T0 + 200_000, status: null })) // no HTTP status → not in timelineStatus
    const s = acc.finish(1)
    const m = Math.floor(T0 / 60000)
    expect(s.timelineStatus).toEqual([[m, 1, 0, 1, 0], [m + 1, 0, 0, 0, 1]])
    expect(s.timeline.map(([minute]) => minute)).toEqual([m, m + 1, m + 3])
  })
})

describe('mergeStats — indicators', () => {
  it('sums the new counters and merges per-IP tables across files', () => {
    const a = new StatsAccumulator()
    const b = new StatsAccumulator()
    for (let i = 0; i < 3; i++) a.add(http({ srcIp: '9.9.9.9', status: '404', userAgent: 'curl/8.0' }))
    for (let i = 0; i < 2; i++) b.add(http({ srcIp: '9.9.9.9', status: '404', userAgent: 'curl/8.0', url: '/.env' }))
    b.add(http({ srcIp: '2.2.2.2' }))
    const m = mergeStats([a.finish(1), b.finish(2)])
    expect(m.automated).toBe(5)
    expect(m.withUserAgent).toBe(6)
    expect(m.sensitive).toBe(2)
    expect(m.ips[0]).toMatchObject({ ip: '9.9.9.9', n: 5, err: 5, auto: 5, sens: 2, tool: 'curl' })
    expect(m.top.srcIp[0]).toEqual(['9.9.9.9', 5])
    expect(m.sensitivePaths).toEqual([['/.env', 2]])
  })

  it('tolerates statistics saved by an older version that lack the new fields', () => {
    const old = new StatsAccumulator().finish(1) as unknown as Record<string, unknown>
    for (const k of ['withUserAgent', 'automated', 'sensitive', 'sensitivePaths', 'payload', 'ips', 'timelineStatus']) delete old[k]
    expect(() => mergeStats([old as never])).not.toThrow()
    expect(mergeStats([old as never]).automated).toBe(0)
  })
})

describe('statusClassTotals', () => {
  it('groups status counts into classes and ignores non-HTTP statuses', () => {
    const acc = new StatsAccumulator()
    for (const [status, n] of [['200', 5], ['304', 2], ['404', 3], ['500', 1], ['FAILED', 4]] as const) {
      for (let i = 0; i < n; i++) acc.add(ev({ status }))
    }
    expect(statusClassTotals(mergeStats([acc.finish(1)]))).toEqual({ c2: 5, c3: 2, c4: 3, c5: 1, http: 11 })
  })
})

describe('rebucketStacked', () => {
  const m = Math.floor(T0 / 60000)

  it('splits each bucket by status class and derives the remainder as "other"', () => {
    const out = rebucketStacked([[m, 10], [m + 1, 5]], [[m, 4, 0, 3, 1], [m + 1, 5, 0, 0, 0]], 60, 0)
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ total: 15, c2: 9, c3: 0, c4: 3, c5: 1, other: 2 })
  })

  it('fills empty buckets between the first and last event so the axis stays evenly spaced', () => {
    const out = rebucketStacked([[m, 1], [m + 180, 1]], [], 60, 0) // 3 hours apart, hourly buckets
    expect(out.map((b) => b.total)).toEqual([1, 0, 0, 1])
    expect(out[1].startMs - out[0].startMs).toBe(3_600_000)
    expect(out[0].durationMs).toBe(3_600_000)
  })

  it('aligns bucket starts to the display timezone', () => {
    const out = rebucketStacked([[m, 1]], [], 60, 420) // UTC+7: 01:00 UTC is 08:00 local → bucket starts 01:00 UTC
    expect(out[0].startMs).toBe(Date.UTC(2026, 7, 4, 1, 0, 0))
    const odd = rebucketStacked([[m + 30, 1]], [], 60, 330) // UTC+5:30: 01:30 UTC is 07:00 local
    expect(odd[0].startMs).toBe(Date.UTC(2026, 7, 4, 1, 30, 0))
  })

  it('returns nothing for an empty timeline', () => {
    expect(rebucketStacked([], [], 60, 0)).toEqual([])
  })
})
