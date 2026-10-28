// ---------------------------------------------------------------------------
// "Key findings": a short, ranked list of the things in the loaded logs that
// most deserve a human look, derived purely from the pre-computed statistics.
//
// Everything is phrased as an indication ("automated client", "sensitive
// paths"), never a verdict. Thresholds are deliberately conservative so the
// list stays short: an address that merely uses curl and gets 200s is not
// worth anyone's attention, while one fetching /.env 400 times is.
// ---------------------------------------------------------------------------
import { chooseBucketMinutes, rebucketTimeline, type MergedStats } from './aggregate'
import {
  ipTarget,
  pathsTarget,
  timeRangeTarget,
  type ExplorerTarget,
} from '../services/explorerTarget'

export type FindingLevel = 'high' | 'medium' | 'info'

export interface Finding {
  id: string
  level: FindingLevel
  title: string
  detail: string
  /** Where "open" should take the analyst; absent when no precise target exists. */
  target?: ExplorerTarget
  score: number
}

export interface FindingOptions {
  /** Formats an instant for display in the person's chosen timezone. */
  formatTime?: (ms: number) => string
  /** Display timezone offset (minutes east of UTC), used to align spike buckets. */
  offsetMinutes?: number
}

export const THRESHOLDS = {
  /** An address needs at least this many events before its error/automation ratios mean anything. */
  minIpEvents: 50,
  errorRate: 0.8,
  automatedRate: 0.5,
  sensitivePerIp: 5,
  maxIpFindings: 3,
  minSensitiveTotal: 10,
  spikeFactor: 5,
  spikeMinEvents: 100,
  minSpikeBuckets: 6,
  maxFindings: 5,
} as const

const LEVEL_WEIGHT: Record<FindingLevel, number> = { high: 3e9, medium: 2e9, info: 1e9 }
const fmtInt = (n: number) => n.toLocaleString('en-US')
const pct = (x: number) => `${Math.round(x * 100)}%`

function defaultFormat(ms: number): string {
  return new Date(ms).toISOString().replace('T', ' ').slice(0, 16)
}

export function buildFindings(merged: MergedStats, opts: FindingOptions = {}): Finding[] {
  const fmt = opts.formatTime ?? defaultFormat
  const out: Finding[] = []

  // ---- addresses that stand out ----------------------------------------------------------
  const ipFindings: Finding[] = []
  for (const e of merged.ips.slice(0, 300)) {
    const t = THRESHOLDS
    const errRate = e.n > 0 ? e.err / e.n : 0
    const autoRate = e.n > 0 ? e.auto / e.n : 0
    const enough = e.n >= t.minIpEvents
    const errHeavy = enough && errRate >= t.errorRate
    const autoHeavy = enough && autoRate >= t.automatedRate

    const flagged = e.inj > 0 || e.sens >= t.sensitivePerIp || errHeavy || (autoHeavy && errRate >= 0.5)
    if (!flagged) continue

    const level: FindingLevel = e.inj > 0 || (errHeavy && e.n >= 500) || e.sens >= 20 ? 'high' : 'medium'
    const parts: string[] = []
    if (e.err > 0 && errRate >= 0.3) parts.push(`${pct(errRate)} errors (4xx/5xx)`)
    if (autoRate >= t.automatedRate) parts.push(`automated client${e.tool ? ` (${e.tool})` : ''}`)
    if (e.sens > 0) parts.push(`${fmtInt(e.sens)} sensitive-path requests`)
    if (e.inj > 0) parts.push(`${fmtInt(e.inj)} suspicious payloads`)

    ipFindings.push({
      id: `ip:${e.ip}`,
      level,
      title: `${e.ip} — ${fmtInt(e.n)} requests`,
      detail: parts.join(' · '),
      target: ipTarget(e.ip),
      score: LEVEL_WEIGHT[level] + e.n,
    })
  }
  ipFindings.sort((a, b) => b.score - a.score)
  out.push(...ipFindings.slice(0, THRESHOLDS.maxIpFindings))

  // ---- sensitive paths --------------------------------------------------------------------
  if (merged.sensitive >= THRESHOLDS.minSensitiveTotal) {
    const topPaths = merged.sensitivePaths.slice(0, 3)
    const level: FindingLevel = merged.sensitive >= 100 ? 'high' : 'medium'
    out.push({
      id: 'sensitive',
      level,
      title: `${fmtInt(merged.sensitive)} requests to sensitive paths`,
      detail: topPaths.map(([p, c]) => `${p} (${fmtInt(c)})`).join(', '),
      target: pathsTarget(topPaths.map(([p]) => p)),
      score: LEVEL_WEIGHT[level] + merged.sensitive,
    })
  }

  // ---- injection-style payloads -----------------------------------------------------------
  const { SQL_INJECTION: sqli, COMMAND_INJECTION: cmdi, XSS: xss } = merged.payload
  const payloadTotal = sqli + cmdi + xss
  if (payloadTotal > 0) {
    const kinds: string[] = []
    if (sqli) kinds.push(`SQL injection ${fmtInt(sqli)}`)
    if (cmdi) kinds.push(`command injection ${fmtInt(cmdi)}`)
    if (xss) kinds.push(`XSS ${fmtInt(xss)}`)
    const worst = merged.ips.filter((e) => e.inj > 0).sort((a, b) => b.inj - a.inj)[0]
    if (worst) kinds.push(`most from ${worst.ip}`)
    out.push({
      id: 'payload',
      level: 'high',
      title: `${fmtInt(payloadTotal)} requests with suspicious payload patterns`,
      detail: kinds.join(' · '),
      target: worst ? ipTarget(worst.ip) : undefined,
      score: LEVEL_WEIGHT.high + payloadTotal,
    })
  }

  // ---- traffic spike ----------------------------------------------------------------------
  const bucketMinutes = chooseBucketMinutes(merged.timeline)
  const buckets = rebucketTimeline(merged.timeline, bucketMinutes, opts.offsetMinutes ?? 0)
  if (buckets.length >= THRESHOLDS.minSpikeBuckets) {
    const counts = buckets.map((b) => b.count).sort((a, b) => a - b)
    const median = counts[Math.floor(counts.length / 2)]
    const peak = buckets.reduce((best, b) => (b.count > best.count ? b : best))
    if (peak.count >= THRESHOLDS.spikeMinEvents && median > 0 && peak.count >= THRESHOLDS.spikeFactor * median) {
      const endMs = peak.startMs + bucketMinutes * 60000
      const factor = Math.round(peak.count / median)
      out.push({
        id: 'spike',
        level: 'medium',
        title: `Traffic spike ${fmt(peak.startMs)} – ${fmt(endMs)}`,
        detail: `${fmtInt(peak.count)} requests, ${factor}× the typical ${bucketLabel(bucketMinutes)}`,
        target: timeRangeTarget(peak.startMs, endMs - 1),
        score: LEVEL_WEIGHT.medium + peak.count,
      })
    }
  }

  return out.sort((a, b) => b.score - a.score).slice(0, THRESHOLDS.maxFindings)
}

export function bucketLabel(minutes: number): string {
  if (minutes < 60) return `${minutes}-minute interval`
  if (minutes < 1440) return `${minutes / 60}-hour interval`
  return `${minutes / 1440}-day interval`
}
