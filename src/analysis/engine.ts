import type { DetectionFinding, DetectionRule, LogEvent } from '../types'

/** The only event fields a rule needs — the runner never keeps whole events in memory. */
export type RuleEvent = Pick<LogEvent, 'id' | 'timestamp' | 'eventType' | 'srcIp' | 'dstIp' | 'username' | 'hostname'>

interface Window {
  ts: number[]
  ids: number[]
  head: number
}

const SWEEP_EVERY = 100_000

/**
 * Streaming evaluator for one threshold/time-window rule.
 *
 * Events must be fed in ascending timestamp order (stream them from the
 * `timestamp` index). It keeps only a small sliding window per group, so memory
 * stays proportional to the number of *active* groups instead of the number of
 * events — which is what makes this safe on millions of rows.
 *
 * Semantics match the original batch algorithm: a finding is emitted as soon as
 * `thresholdCount` matching events from the same group fall inside
 * `windowSeconds`, and that group's window is then reset.
 */
export class RuleRunner {
  readonly findings: DetectionFinding[] = []
  private rule: DetectionRule
  private windowMs: number
  private groups = new Map<string, Window>()
  private fed = 0
  private lastTs = 0

  constructor(rule: DetectionRule) {
    this.rule = rule
    this.windowMs = rule.windowSeconds * 1000
  }

  feed(e: RuleEvent) {
    const rule = this.rule
    if (rule.conditionEventType && e.eventType !== rule.conditionEventType) return
    if (e.timestamp === null) return
    const key = e[rule.groupByField]
    if (key === null) return

    let w = this.groups.get(key)
    if (!w) {
      w = { ts: [], ids: [], head: 0 }
      this.groups.set(key, w)
    }
    w.ts.push(e.timestamp)
    w.ids.push(e.id!)
    this.lastTs = e.timestamp

    while (e.timestamp - w.ts[w.head] > this.windowMs) w.head++
    if (w.head > 1024 && w.head * 2 > w.ts.length) {
      w.ts = w.ts.slice(w.head)
      w.ids = w.ids.slice(w.head)
      w.head = 0
    }

    const count = w.ts.length - w.head
    if (count >= rule.thresholdCount) {
      this.findings.push({
        ruleName: rule.name,
        groupValue: key,
        count,
        windowStart: w.ts[w.head],
        windowEnd: e.timestamp,
        logIds: w.ids.slice(w.head),
        description: `${rule.name}: ${count} matching events from ${key} within ${rule.windowSeconds}s`,
      })
      // Same as the batch version: the burst is reported once, then the window starts over.
      w.ts = []
      w.ids = []
      w.head = 0
    }

    if (++this.fed % SWEEP_EVERY === 0) this.sweep()
  }

  /** Forget groups whose newest event is already older than the window, so memory doesn't grow with distinct keys. */
  private sweep() {
    for (const [key, w] of this.groups) {
      const n = w.ts.length
      if (n === 0 || this.lastTs - w.ts[n - 1] > this.windowMs) this.groups.delete(key)
    }
  }
}

/** Runs several rules over a single pass of the data. */
export class RuleSet {
  private runners: RuleRunner[]

  constructor(rules: DetectionRule[]) {
    this.runners = rules.filter((r) => r.enabled).map((r) => new RuleRunner(r))
  }

  feed(e: RuleEvent) {
    for (const r of this.runners) r.feed(e)
  }

  get findings(): DetectionFinding[] {
    return this.runners.flatMap((r) => r.findings)
  }
}

/** Batch helper (tests, small inputs): sorts by time, then streams through the runner. */
export function runRule(rule: DetectionRule, events: LogEvent[]): DetectionFinding[] {
  const runner = new RuleRunner(rule)
  const sorted = [...events].sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0))
  for (const e of sorted) runner.feed(e)
  return runner.findings
}

export function runAllRules(rules: DetectionRule[], events: LogEvent[]): DetectionFinding[] {
  return rules.filter((r) => r.enabled).flatMap((r) => runRule(r, events))
}
