import { describe, it, expect } from 'vitest'
import { runRule } from '../engine'
import { detectInjection } from '../injection'
import type { DetectionRule, LogEvent } from '../../types'

function makeEvent(overrides: Partial<LogEvent>): LogEvent {
  return {
    id: overrides.id,
    fileId: 1,
    timestamp: Date.now(),
    timestampRaw: null,
    hostname: null,
    logSource: null,
    eventType: 'SSH_LOGIN_FAILED',
    severity: 'MEDIUM',
    srcIp: '192.168.1.20',
    srcPort: null,
    dstIp: null,
    dstPort: null,
    protocol: null,
    username: null,
    process: null,
    action: null,
    status: null,
    message: null,
    rawLog: 'raw',
    mark: null,
    lineNumber: 0,
    url: null,
    httpVersion: null,
    userAgent: null,
    referer: null,
    requestBody: null,
    ...overrides,
  }
}

const bruteForceRule: DetectionRule = {
  name: 'SSH Brute Force',
  description: '',
  enabled: true,
  builtin: true,
  conditionEventType: 'SSH_LOGIN_FAILED',
  groupByField: 'srcIp',
  thresholdCount: 5,
  windowSeconds: 60,
  resultSeverity: 'HIGH',
  resultTag: 'BRUTE_FORCE',
  createdAt: Date.now(),
}

describe('runRule (threshold/window detection)', () => {
  it('flags a burst of failed logins from the same IP within the window', () => {
    // The engine fires as soon as the threshold is reached within the window,
    // then resets — this avoids emitting overlapping/duplicate alerts for the
    // same ongoing burst. With threshold=5, the finding triggers at the 5th event.
    const base = Date.now()
    const events = Array.from({ length: 6 }, (_, i) =>
      makeEvent({ id: i + 1, timestamp: base + i * 1000 }),
    )
    const findings = runRule(bruteForceRule, events)
    expect(findings.length).toBe(1)
    expect(findings[0].count).toBe(5)
    expect(findings[0].groupValue).toBe('192.168.1.20')
  })

  it('does not flag events spread out beyond the window', () => {
    const base = Date.now()
    const events = Array.from({ length: 6 }, (_, i) =>
      makeEvent({ id: i + 1, timestamp: base + i * 30_000 }), // 30s apart, window is 60s but threshold 5 within 60s window only covers ~2 events at a time
    )
    const findings = runRule(bruteForceRule, events)
    expect(findings.length).toBe(0)
  })

  it('does not flag events below the threshold', () => {
    const base = Date.now()
    const events = Array.from({ length: 3 }, (_, i) =>
      makeEvent({ id: i + 1, timestamp: base + i * 1000 }),
    )
    const findings = runRule(bruteForceRule, events)
    expect(findings.length).toBe(0)
  })

  it('separates findings by distinct group values (source IPs)', () => {
    const base = Date.now()
    const eventsA = Array.from({ length: 5 }, (_, i) => makeEvent({ id: i + 1, timestamp: base + i * 1000, srcIp: '10.0.0.1' }))
    const eventsB = Array.from({ length: 5 }, (_, i) => makeEvent({ id: i + 10, timestamp: base + i * 1000, srcIp: '10.0.0.2' }))
    const findings = runRule(bruteForceRule, [...eventsA, ...eventsB])
    expect(findings.length).toBe(2)
  })
})

describe('detectInjection', () => {
  it('flags SQL injection patterns', () => {
    const matches = detectInjection("' OR 1=1 --")
    expect(matches.some((m) => m.tag === 'SQL_INJECTION')).toBe(true)
  })

  it('flags command injection patterns', () => {
    const matches = detectInjection('cat /etc/passwd')
    expect(matches.some((m) => m.tag === 'COMMAND_INJECTION')).toBe(true)
  })

  it('flags XSS patterns', () => {
    const matches = detectInjection('<script>alert(1)</script>')
    expect(matches.some((m) => m.tag === 'XSS')).toBe(true)
  })

  it('returns no matches for benign text', () => {
    const matches = detectInjection('user logged in successfully')
    expect(matches.length).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// Streaming evaluator (RuleRunner / RuleSet)
// ---------------------------------------------------------------------------
import { RuleRunner, RuleSet } from '../engine'

/** The original batch algorithm, kept here as the reference the streaming version must match. */
function referenceRule(rule: DetectionRule, events: LogEvent[]) {
  const groups = new Map<string, LogEvent[]>()
  for (const e of events) {
    if (rule.conditionEventType && e.eventType !== rule.conditionEventType) continue
    if (e.timestamp === null) continue
    const key = e[rule.groupByField] as string | null
    if (key === null) continue
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(e)
  }
  const windowMs = rule.windowSeconds * 1000
  const out: { group: string; count: number; start: number; end: number; ids: number[] }[] = []
  for (const [group, evs] of groups) {
    const sorted = [...evs].sort((a, b) => a.timestamp! - b.timestamp!)
    let left = 0
    for (let right = 0; right < sorted.length; right++) {
      while (sorted[right].timestamp! - sorted[left].timestamp! > windowMs) left++
      const count = right - left + 1
      if (count >= rule.thresholdCount) {
        out.push({ group, count, start: sorted[left].timestamp!, end: sorted[right].timestamp!, ids: sorted.slice(left, right + 1).map((e) => e.id!) })
        left = right + 1
      }
    }
  }
  return out
}

describe('RuleRunner (streaming)', () => {
  it('reports a burst once, resets, and can report the next burst', () => {
    const runner = new RuleRunner(bruteForceRule) // threshold 5 within 60s
    const base = 1_700_000_000_000
    for (let i = 0; i < 12; i++) runner.feed(makeEvent({ id: i + 1, timestamp: base + i * 1000 }))
    expect(runner.findings.map((f) => f.count)).toEqual([5, 5]) // events 1-5, then 6-10; 11-12 are not enough
  })

  it('matches the original batch algorithm on a large random data set', () => {
    let seed = 12345
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff)
    const events: LogEvent[] = Array.from({ length: 20_000 }, (_, i) =>
      makeEvent({
        id: i + 1,
        timestamp: 1_700_000_000_000 + Math.floor(rnd() * 3_600_000),
        srcIp: `10.0.0.${Math.floor(rnd() * 40)}`,
        eventType: rnd() < 0.8 ? 'SSH_LOGIN_FAILED' : 'HTTP_200',
      }),
    )
    const rule = { ...bruteForceRule, thresholdCount: 8, windowSeconds: 120 }

    const expected = referenceRule(rule, events)
    const streamed = new RuleRunner(rule)
    for (const e of [...events].sort((a, b) => a.timestamp! - b.timestamp!)) streamed.feed(e)

    const norm = (xs: { group?: string; groupValue?: string; count: number; start?: number; windowStart?: number; end?: number; windowEnd?: number }[]) =>
      xs.map((x) => `${x.group ?? x.groupValue}|${x.count}|${x.start ?? x.windowStart}|${x.end ?? x.windowEnd}`).sort()
    expect(expected.length).toBeGreaterThan(50) // make sure the data actually triggers plenty of findings
    expect(norm(streamed.findings)).toEqual(norm(expected))
  })

  it('records exactly the ids of the events inside the window', () => {
    const runner = new RuleRunner({ ...bruteForceRule, thresholdCount: 3, windowSeconds: 10 })
    const t = 1_700_000_000_000
    runner.feed(makeEvent({ id: 1, timestamp: t }))
    runner.feed(makeEvent({ id: 2, timestamp: t + 30_000 })) // too late for the first one
    runner.feed(makeEvent({ id: 3, timestamp: t + 31_000 }))
    runner.feed(makeEvent({ id: 4, timestamp: t + 32_000 }))
    expect(runner.findings).toHaveLength(1)
    expect(runner.findings[0].logIds).toEqual([2, 3, 4])
  })

  it('does not keep every group forever: stale groups are swept', () => {
    const runner = new RuleRunner({ ...bruteForceRule, thresholdCount: 1000, windowSeconds: 60 })
    const t = 1_700_000_000_000
    // 250k events from 250k distinct IPs, one per second: only the last ~minute is still relevant.
    for (let i = 0; i < 250_000; i++) {
      runner.feed(makeEvent({ id: i + 1, timestamp: t + i * 1000, srcIp: `${i}.x` }))
    }
    const size = (runner as unknown as { groups: Map<string, unknown> }).groups.size
    expect(size).toBeLessThanOrEqual(100_000) // swept every 100k events
    expect(size).toBeLessThan(250_000 / 2)
  })

  it('RuleSet feeds all enabled rules in one pass and skips disabled ones', () => {
    const disabled = { ...bruteForceRule, name: 'off', enabled: false }
    const set = new RuleSet([bruteForceRule, disabled])
    const base = 1_700_000_000_000
    for (let i = 0; i < 5; i++) set.feed(makeEvent({ id: i + 1, timestamp: base + i * 1000 }))
    expect(set.findings.map((f) => f.ruleName)).toEqual(['SSH Brute Force'])
  })
})
