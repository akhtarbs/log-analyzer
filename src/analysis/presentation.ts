// ---------------------------------------------------------------------------
// What the Analysis page shows, derived from the merged statistics. Kept free of
// React so the numbers, badges and exports can be tested directly.
// ---------------------------------------------------------------------------
import { statusClassTotals, type MergedStats } from './aggregate'
import { THRESHOLDS } from './findings'
import { classifyUserAgent, describeStatus, isSensitivePath, statusClass } from './indicators'
import {
  dstIpTarget,
  ipTarget,
  pathTarget,
  statusTarget,
  userAgentTarget,
  usernameTarget,
  type ExplorerTarget,
} from '../services/explorerTarget'
import type { IpEntry, TopList } from '../types'

// ---- summary cards ----------------------------------------------------------------------------

export interface Summary {
  requests: number
  files: number
  /** Share of HTTP responses that were 4xx/5xx, or null when the logs carry no HTTP status. */
  errorRate: number | null
  errors: number
  httpResponses: number
  /** Share of events with a user agent that came from an automated client, or null without user agents. */
  automatedRate: number | null
  automated: number
  withUserAgent: number
  marked: number
  failedAuth: number
}

export function buildSummary(merged: MergedStats, marked: number): Summary {
  const sc = statusClassTotals(merged)
  const errors = sc.c4 + sc.c5
  return {
    requests: merged.totalEvents,
    files: merged.fileCount,
    errorRate: sc.http > 0 ? errors / sc.http : null,
    errors,
    httpResponses: sc.http,
    automatedRate: merged.withUserAgent > 0 ? merged.automated / merged.withUserAgent : null,
    automated: merged.automated,
    withUserAgent: merged.withUserAgent,
    marked,
    failedAuth: merged.failedAuth,
  }
}

// ---- indicator tabs ---------------------------------------------------------------------------

export type IndicatorTab = 'ip' | 'userAgent' | 'url' | 'status' | 'username' | 'dstIp'

export const TAB_LABELS: Record<IndicatorTab, string> = {
  ip: 'Source IP',
  userAgent: 'User Agent',
  url: 'URL / Path',
  status: 'Status',
  username: 'Username',
  dstIp: 'Destination IP',
}

/** What a single row is called in the detail view / exports. */
export const TAB_SINGULAR: Record<IndicatorTab, string> = {
  ip: 'IP address',
  userAgent: 'User agent',
  url: 'URL path',
  status: 'HTTP status',
  username: 'Username',
  dstIp: 'Destination IP',
}

export type BadgeTone = 'danger' | 'warn' | 'info' | 'ok'
export interface Badge {
  label: string
  tone: BadgeTone
}

export interface IndicatorRow {
  value: string
  count: number
  /** Fraction of all events (0-1). */
  share: number
  badges: Badge[]
  /** Present on the Source IP tab: the richer per-address numbers. */
  ip?: IpEntry
}

/** The four main tabs always appear; Username / Destination IP only when the logs actually have them (e.g. SSH logs). */
export function availableTabs(merged: MergedStats): IndicatorTab[] {
  const tabs: IndicatorTab[] = ['ip', 'userAgent', 'url', 'status']
  if (merged.top.username.length > 0) tabs.push('username')
  if (merged.top.dstIp.length > 0) tabs.push('dstIp')
  return tabs
}

export function ipBadges(e: IpEntry): Badge[] {
  const out: Badge[] = []
  const t = THRESHOLDS
  if (e.inj > 0) out.push({ label: `Payloads ×${e.inj}`, tone: 'danger' })
  if (e.sens > 0) out.push({ label: `Sensitive paths ×${e.sens}`, tone: e.sens >= t.sensitivePerIp ? 'danger' : 'warn' })
  if (e.n >= t.minIpEvents && e.err / e.n >= t.errorRate) out.push({ label: 'Mostly errors', tone: 'warn' })
  if (e.n >= 1 && e.auto / e.n >= t.automatedRate) out.push({ label: e.tool ? `Automated (${e.tool})` : 'Automated', tone: 'warn' })
  return out
}

function statusBadges(status: string): Badge[] {
  const c = statusClass(status)
  if (c === null) return []
  const text = describeStatus(status)
  const label = text ? `${c}xx ${text}` : `${c}xx`
  return [{ label, tone: c === 2 ? 'ok' : c === 3 ? 'info' : c === 4 ? 'warn' : 'danger' }]
}

function listFor(merged: MergedStats, tab: IndicatorTab): TopList {
  switch (tab) {
    case 'ip': return merged.top.srcIp
    case 'userAgent': return merged.top.userAgent
    case 'url': return merged.top.url
    case 'status': return merged.top.status
    case 'username': return merged.top.username
    case 'dstIp': return merged.top.dstIp
  }
}

export function indicatorRows(merged: MergedStats, tab: IndicatorTab, limit = 10): IndicatorRow[] {
  const total = merged.totalEvents || 1
  const ipByAddress = tab === 'ip' ? new Map(merged.ips.map((e) => [e.ip, e])) : null
  return listFor(merged, tab)
    .slice(0, limit)
    .map(([value, count]): IndicatorRow => {
      const row: IndicatorRow = { value, count, share: count / total, badges: [] }
      if (tab === 'ip') {
        const e = ipByAddress!.get(value)
        if (e) {
          row.ip = e
          row.badges = ipBadges(e)
        }
      } else if (tab === 'userAgent') {
        const tool = classifyUserAgent(value)
        if (tool) row.badges = [{ label: `Automated (${tool})`, tone: 'warn' }]
      } else if (tab === 'url') {
        if (isSensitivePath(value)) row.badges = [{ label: 'Sensitive path', tone: 'danger' }]
      } else if (tab === 'status') {
        row.badges = statusBadges(value)
      }
      return row
    })
}

export function indicatorTarget(tab: IndicatorTab, value: string): ExplorerTarget {
  switch (tab) {
    case 'ip': return ipTarget(value)
    case 'userAgent': return userAgentTarget(value)
    case 'url': return pathTarget(value)
    case 'status': return statusTarget(value)
    case 'username': return usernameTarget(value)
    case 'dstIp': return dstIpTarget(value)
  }
}

// ---- CSV export -------------------------------------------------------------------------------

function csvCell(v: string | number): string {
  const s = String(v)
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** CSV of the rows, e.g. to hand a list of addresses to a blocklist or a ticket. */
export function indicatorCsv(tab: IndicatorTab, rows: IndicatorRow[]): string {
  const header = [TAB_SINGULAR[tab].toLowerCase().replace(/ /g, '_'), 'events', 'share_percent', 'flags']
  const lines = rows.map((r) =>
    [r.value, r.count, (r.share * 100).toFixed(2), r.badges.map((b) => b.label).join('; ')].map(csvCell).join(','),
  )
  return [header.join(','), ...lines].join('\n')
}
