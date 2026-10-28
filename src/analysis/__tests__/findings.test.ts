import { describe, it, expect } from 'vitest'
import { StatsAccumulator, mergeStats } from '../aggregate'
import { buildFindings, THRESHOLDS } from '../findings'

type Ev = Parameters<StatsAccumulator['add']>[0]
const T0 = Date.UTC(2026, 7, 4, 0, 0, 0)
const req = (o: Partial<Ev> = {}): Ev => ({
  timestamp: T0, severity: 'INFO', srcIp: '10.0.0.1', dstIp: null, username: null, eventType: 'HTTP_200',
  userAgent: 'Mozilla/5.0 (X11; Ubuntu) Firefox/28.0', url: '/index.html', status: '200', action: 'GET', ...o,
})

function merged(events: Ev[]) {
  const acc = new StatsAccumulator()
  for (const e of events) acc.add(e)
  return mergeStats([acc.finish(1)])
}
const many = (n: number, o: Partial<Ev>): Ev[] => Array.from({ length: n }, () => req(o))

describe('buildFindings — addresses', () => {
  it('flags a scanner: mostly errors, automated client, sensitive paths', () => {
    const f = buildFindings(merged([
      ...many(600, { srcIp: '185.191.171.18', status: '404', userAgent: 'sqlmap/1.7', url: '/.env' }),
      ...many(20, { srcIp: '10.0.0.5' }),
    ]))
    const ip = f.find((x) => x.id === 'ip:185.191.171.18')!
    expect(ip).toBeTruthy()
    expect(ip.level).toBe('high')
    expect(ip.title).toBe('185.191.171.18 — 600 requests')
    expect(ip.detail).toContain('100% errors')
    expect(ip.detail).toContain('automated client (sqlmap)')
    expect(ip.detail).toContain('600 sensitive-path requests')
    expect(ip.target?.filter?.rules[0]).toMatchObject({ field: 'srcIp', operator: 'equals', value: '185.191.171.18' })
  })

  it('does not flag a busy but ordinary address', () => {
    expect(buildFindings(merged(many(5000, { srcIp: '10.0.0.9' })))).toEqual([])
  })

  it('does not flag a monitoring script that uses curl and gets 200s', () => {
    expect(buildFindings(merged(many(2000, { srcIp: '10.0.0.7', userAgent: 'curl/8.4.0' })))).toEqual([])
  })

  it('needs a minimum number of events before judging error ratios', () => {
    const few = many(THRESHOLDS.minIpEvents - 1, { srcIp: '1.2.3.4', status: '404' })
    expect(buildFindings(merged(few))).toEqual([])
  })

  it('always flags an address that sent an injection-style payload, however small', () => {
    const f = buildFindings(merged([req({ srcIp: '6.6.6.6', url: "/item?id=1' OR 1=1--" })]))
    expect(f.some((x) => x.id === 'ip:6.6.6.6' && x.level === 'high')).toBe(true)
  })

  it('lists at most three addresses so other kinds of finding still fit', () => {
    const events: Ev[] = []
    for (let i = 1; i <= 8; i++) events.push(...many(100 + i, { srcIp: `9.9.9.${i}`, status: '404', userAgent: 'curl/8.0' }))
    const ips = buildFindings(merged(events)).filter((x) => x.id.startsWith('ip:'))
    expect(ips).toHaveLength(THRESHOLDS.maxIpFindings)
    expect(ips[0].id).toBe('ip:9.9.9.8') // busiest first
  })
})

describe('buildFindings — sensitive paths and payloads', () => {
  it('summarises sensitive-path requests with the top paths and a path filter', () => {
    const f = buildFindings(merged([
      ...many(8, { srcIp: '1.1.1.1', url: '/.env' }),
      ...many(5, { srcIp: '2.2.2.2', url: '/wp-login.php?x=1' }),
      ...many(30, { srcIp: '3.3.3.3' }),
    ]))
    const s = f.find((x) => x.id === 'sensitive')!
    expect(s.title).toBe('13 requests to sensitive paths')
    expect(s.detail).toBe('/.env (8), /wp-login.php (5)')
    expect(s.level).toBe('medium')
    const rules = s.target!.filter!.rules
    expect(s.target!.filter!.combinator).toBe('OR')
    expect(rules.map((r) => (r as { value: string }).value)).toEqual(['/.env', '/.env?', '/wp-login.php', '/wp-login.php?'])
  })

  it('stays silent below the sensitive-path threshold', () => {
    expect(buildFindings(merged(many(THRESHOLDS.minSensitiveTotal - 1, { url: '/.env' }))).some((x) => x.id === 'sensitive')).toBe(false)
  })

  it('reports payload patterns by category and points at the worst offender', () => {
    const f = buildFindings(merged([
      ...many(3, { srcIp: '6.6.6.6', url: '/x?id=1%27+UNION+SELECT+1,2' }),
      req({ srcIp: '7.7.7.7', url: '/s?q=%3Cscript%3Ealert(1)%3C/script%3E' }),
    ]))
    const p = f.find((x) => x.id === 'payload')!
    expect(p.level).toBe('high')
    expect(p.title).toBe('4 requests with suspicious payload patterns')
    expect(p.detail).toContain('SQL injection 3')
    expect(p.detail).toContain('XSS 1')
    expect(p.detail).toContain('most from 6.6.6.6')
    expect(p.target?.filter?.rules[0]).toMatchObject({ field: 'srcIp', value: '6.6.6.6' })
  })
})

describe('buildFindings — traffic spike', () => {
  const steady = (hours: number, perHour: number): Ev[] =>
    Array.from({ length: hours * perHour }, (_, i) => req({ srcIp: `10.0.${i % 50}.1`, timestamp: T0 + Math.floor(i / perHour) * 3_600_000 + (i % perHour) * 1000 }))

  it('finds a burst far above the typical interval and links to exactly that interval', () => {
    const burst = Array.from({ length: 900 }, (_, i) => req({ srcIp: '10.9.9.9', timestamp: T0 + 10 * 3_600_000 + i * 1000 }))
    const f = buildFindings(merged([...steady(24, 40), ...burst]), { formatTime: (ms) => new Date(ms).toISOString().slice(11, 16) })
    const spike = f.find((x) => x.id === 'spike')!
    expect(spike).toBeTruthy()
    // 24 hours of data → the same ~15-minute auto bucket the chart uses; the 900 burst events land in one bucket.
    expect(spike.title).toBe('Traffic spike 10:00 – 10:15')
    expect(spike.detail).toBe('940 requests, 24× the typical 15-minute interval')
    expect(spike.target!.timeRange).toEqual({ start: T0 + 10 * 3_600_000, end: T0 + 10 * 3_600_000 + 15 * 60_000 - 1 })
  })

  it('reports nothing for flat traffic', () => {
    expect(buildFindings(merged(steady(24, 60))).some((x) => x.id === 'spike')).toBe(false)
  })

  it('ignores a small absolute peak even when it is large relative to a tiny baseline', () => {
    const tiny = [...steady(10, 2), ...Array.from({ length: 30 }, (_, i) => req({ timestamp: T0 + 5 * 3_600_000 + i * 1000 }))]
    expect(buildFindings(merged(tiny)).some((x) => x.id === 'spike')).toBe(false)
  })
})

describe('buildFindings — overall', () => {
  it('returns nothing for empty statistics', () => {
    expect(buildFindings(mergeStats([]))).toEqual([])
  })

  it('never returns more than the maximum, strongest first', () => {
    const events: Ev[] = []
    for (let i = 1; i <= 6; i++) events.push(...many(200, { srcIp: `9.9.9.${i}`, status: '404', userAgent: 'sqlmap/1.7', url: '/.env' }))
    events.push(req({ srcIp: '6.6.6.6', url: "/x?id=1' or 1=1--" }))
    const f = buildFindings(merged(events))
    expect(f.length).toBeLessThanOrEqual(THRESHOLDS.maxFindings)
    const scores = f.map((x) => x.score)
    expect([...scores].sort((a, b) => b - a)).toEqual(scores)
  })
})
