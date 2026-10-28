import { describe, it, expect } from 'vitest'
import { StatsAccumulator, mergeStats } from '../aggregate'
import { buildSummary, availableTabs, indicatorRows, indicatorCsv, indicatorTarget, ipBadges } from '../presentation'
import { formatPercent } from '../../utils/format'
import { evalGroup } from '../../services/filterEngine'
import type { LogEvent } from '../../types'

type Ev = Parameters<StatsAccumulator['add']>[0]
const T0 = Date.UTC(2026, 7, 4)
const req = (o: Partial<Ev> = {}): Ev => ({
  timestamp: T0, severity: 'INFO', srcIp: '10.0.0.1', dstIp: null, username: null, eventType: 'HTTP_200',
  userAgent: 'Mozilla/5.0 (X11; Ubuntu) Firefox/28.0', url: '/index.html', status: '200', action: 'GET', ...o,
})
const merged = (events: Ev[]) => {
  const acc = new StatsAccumulator()
  events.forEach((e) => acc.add(e))
  return mergeStats([acc.finish(1)])
}
const many = (n: number, o: Partial<Ev>) => Array.from({ length: n }, () => req(o))

describe('formatPercent', () => {
  it('formats ratios and handles "nothing to measure"', () => {
    expect(formatPercent(null)).toBe('—')
    expect(formatPercent(0)).toBe('0.0%')
    expect(formatPercent(0.0004)).toBe('<0.1%')
    expect(formatPercent(0.042)).toBe('4.2%')
    expect(formatPercent(0.386)).toBe('39%')
    expect(formatPercent(1)).toBe('100%')
  })
})

describe('buildSummary', () => {
  it('computes the error and automated shares from HTTP responses and user agents', () => {
    const s = buildSummary(merged([
      ...many(6, { status: '200' }), ...many(3, { status: '404' }), req({ status: '500' }),
      ...many(4, { userAgent: 'curl/8.0' }),
    ]), 12)
    expect(s.requests).toBe(14)
    expect(s.httpResponses).toBe(14)
    expect(s.errors).toBe(4)
    expect(s.errorRate).toBeCloseTo(4 / 14)
    expect(s.withUserAgent).toBe(14)
    expect(s.automated).toBe(4)
    expect(s.automatedRate).toBeCloseTo(4 / 14)
    expect(s.marked).toBe(12)
  })

  it('reports "no data" (null) rather than 0% when the logs have no HTTP status or user agent', () => {
    const s = buildSummary(merged([req({ status: null, userAgent: null, eventType: 'SSH_LOGIN_FAILED' })]), 0)
    expect(s.errorRate).toBeNull()
    expect(s.automatedRate).toBeNull()
  })
})

describe('availableTabs', () => {
  it('always offers the four main tabs, and Username / Destination IP only when the logs have them', () => {
    expect(availableTabs(merged(many(3, {})))).toEqual(['ip', 'userAgent', 'url', 'status'])
    expect(availableTabs(merged(many(3, { username: 'root', dstIp: '10.0.0.2' })))).toEqual(['ip', 'userAgent', 'url', 'status', 'username', 'dstIp'])
  })
})

describe('indicatorRows', () => {
  const m = merged([
    ...many(50, { srcIp: '9.9.9.9', status: '404', userAgent: 'sqlmap/1.7', url: '/.env' }),
    ...many(30, { srcIp: '10.0.0.1', url: '/index.html' }),
    req({ srcIp: '7.7.7.7', url: "/x?id=1' or 1=1--" }),
  ])

  it('ranks addresses with their share and the reasons they stand out', () => {
    const rows = indicatorRows(m, 'ip')
    expect(rows[0].value).toBe('9.9.9.9')
    expect(rows[0].count).toBe(50)
    expect(rows[0].share).toBeCloseTo(50 / 81)
    const labels = rows[0].badges.map((b) => b.label)
    expect(labels).toContain('Sensitive paths ×50')
    expect(labels).toContain('Mostly errors')
    expect(labels).toContain('Automated (sqlmap)')
    expect(rows[0].ip?.tool).toBe('sqlmap')
    expect(rows.find((r) => r.value === '10.0.0.1')!.badges).toEqual([])
    expect(rows.find((r) => r.value === '7.7.7.7')!.badges[0]).toEqual({ label: 'Payloads ×1', tone: 'danger' })
  })

  it('marks automated user agents, sensitive paths and status classes', () => {
    expect(indicatorRows(m, 'userAgent')[0].badges[0].label).toBe('Automated (sqlmap)')
    expect(indicatorRows(m, 'userAgent').find((r) => r.value.startsWith('Mozilla'))!.badges).toEqual([])
    expect(indicatorRows(m, 'url').find((r) => r.value === '/.env')!.badges).toEqual([{ label: 'Sensitive path', tone: 'danger' }])
    expect(indicatorRows(m, 'status').find((r) => r.value === '404')!.badges).toEqual([{ label: '4xx Not Found', tone: 'warn' }])
    expect(indicatorRows(m, 'status').find((r) => r.value === '200')!.badges[0].tone).toBe('ok')
  })

  it('respects the row limit', () => {
    expect(indicatorRows(m, 'ip', 2)).toHaveLength(2)
    expect(indicatorRows(m, 'ip', Infinity).length).toBeGreaterThanOrEqual(3)
  })
})

describe('ipBadges', () => {
  it('stays quiet for an ordinary address', () => {
    expect(ipBadges({ ip: '1.1.1.1', n: 5000, err: 10, auto: 0, sens: 0, inj: 0, tool: null })).toEqual([])
  })
})

describe('indicatorTarget', () => {
  const log = (o: Partial<LogEvent>): LogEvent => ({
    fileId: 1, timestamp: 1, timestampRaw: null, hostname: null, logSource: null, eventType: null, severity: 'INFO',
    srcIp: null, srcPort: null, dstIp: null, dstPort: null, protocol: null, username: null, process: null, action: null,
    status: null, message: null, rawLog: '', mark: null, lineNumber: 1, url: null, httpVersion: null, userAgent: null,
    referer: null, requestBody: null, ...o,
  })
  it('builds a filter that selects exactly the clicked value', () => {
    expect(evalGroup(log({ status: '404' }), indicatorTarget('status', '404').filter!)).toBe(true)
    expect(evalGroup(log({ status: '403' }), indicatorTarget('status', '404').filter!)).toBe(false)
    expect(evalGroup(log({ url: '/a?x=1' }), indicatorTarget('url', '/a').filter!)).toBe(true)
    expect(evalGroup(log({ userAgent: 'curl/8.0' }), indicatorTarget('userAgent', 'curl/8.0').filter!)).toBe(true)
    expect(evalGroup(log({ username: 'root' }), indicatorTarget('username', 'root').filter!)).toBe(true)
  })
})

describe('indicatorCsv', () => {
  it('writes a header, share as a percentage, flags, and quotes values that need it', () => {
    const m = merged([
      ...many(3, { srcIp: '9.9.9.9', userAgent: 'Mozilla/5.0 (X11; Linux), "quoted"' }),
      ...many(1, { srcIp: '1.1.1.1', userAgent: 'curl/8.0' }),
    ])
    const csv = indicatorCsv('userAgent', indicatorRows(m, 'userAgent', Infinity))
    const lines = csv.split('\n')
    expect(lines[0]).toBe('user_agent,events,share_percent,flags')
    expect(lines[1]).toBe('"Mozilla/5.0 (X11; Linux), ""quoted""",3,75.00,')
    expect(lines[2]).toBe('curl/8.0,1,25.00,Automated (curl)')
  })
})
