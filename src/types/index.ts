// ---------------------------------------------------------------------------
// Core domain types for Local Log Analyzer
// Everything here is stored locally in IndexedDB. Nothing leaves the browser.
// ---------------------------------------------------------------------------

export type Severity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO'

export type MarkType = 'CRITICAL' | 'SUSPICIOUS' | 'REVIEW' | 'BENIGN' | 'INFO' | null

export type ParserName =
  | 'linux_syslog'
  | 'linux_auth'
  | 'apache_access'
  | 'apache_error'
  | 'nginx_access'
  | 'nginx_error'
  | 'json'
  | 'jsonl'
  | 'csv'
  | 'generic'

export interface LogEvent {
  id?: number
  fileId: number
  timestamp: number | null // epoch ms, null if unparseable
  timestampRaw: string | null
  hostname: string | null
  logSource: string | null
  eventType: string | null
  severity: Severity
  srcIp: string | null
  srcPort: number | null
  dstIp: string | null
  dstPort: number | null
  protocol: string | null
  username: string | null
  process: string | null
  action: string | null
  status: string | null
  message: string | null
  rawLog: string
  mark: MarkType
  lineNumber: number
  /** HTTP request path/URL, extracted from access logs or JSON fields. */
  url: string | null
  /** HTTP protocol version, e.g. "HTTP/1.1" — extracted from access logs. */
  httpVersion: string | null
  /** User-Agent / browser/client string. */
  userAgent: string | null
  /** HTTP Referer header, when present. */
  referer: string | null
  /** Request body / payload, when the log source captures it (mainly JSON/JSONL sources). */
  requestBody: string | null
}

export interface LogFile {
  id?: number
  name: string
  size: number
  importedAt: number
  eventCount: number
  parser: ParserName
  processingTimeMs: number
  storeOriginal: boolean
  originalContent?: string // only kept if small / user opts in
  /** When false, this file's events are excluded from dashboard stats, analysis, and detection rules. */
  active: boolean
}

export interface Tag {
  id?: number
  name: string
  color: string
  builtin: boolean
}

export interface LogTag {
  id?: number
  logId: number
  tagId: number
}

export type InvestigationStatus = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED' | 'FALSE_POSITIVE'
export type Priority = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'

export interface Investigation {
  id?: number
  code: string // e.g. INV-2026-001
  title: string
  description: string
  priority: Priority
  status: InvestigationStatus
  createdAt: number
  updatedAt: number
}

export interface InvestigationLog {
  id?: number
  investigationId: number
  logId: number
  note?: string
  addedAt: number
}

export interface Note {
  id?: number
  logId: number
  text: string
  createdAt: number
}

export type FilterOperator =
  | 'equals'
  | 'not_equals'
  | 'contains'
  | 'not_contains'
  | 'starts_with'
  | 'ends_with'
  | 'gt'
  | 'lt'
  | 'between'
  | 'in'
  | 'is_empty'
  | 'is_not_empty'

export interface FilterCondition {
  id: string
  kind: 'condition'
  field: string
  operator: FilterOperator
  value: string
  value2?: string // for "between"
}

export type FilterRule = FilterCondition | FilterGroup

export interface FilterGroup {
  id: string
  kind: 'group'
  combinator: 'AND' | 'OR'
  /** Can contain conditions and/or nested groups, each combined using this group's combinator. */
  rules: FilterRule[]
}

export interface SavedFilter {
  id?: number
  name: string
  description?: string
  group: FilterGroup
  createdAt: number
}

export interface DetectionRule {
  id?: number
  name: string
  description: string
  enabled: boolean
  builtin: boolean
  // simplified rule model: threshold-based over a field within a time window
  conditionEventType: string | null
  groupByField: 'srcIp' | 'dstIp' | 'username' | 'hostname'
  thresholdCount: number
  windowSeconds: number
  resultSeverity: Severity
  resultTag: string
  createdAt: number
}

export interface AppSettings {
  id?: number
  key: string
  value: string
}

export interface DetectionFinding {
  ruleName: string
  groupValue: string
  count: number
  windowStart: number
  windowEnd: number
  logIds: number[]
  description: string
}

/** Version of the aggregation logic. Bump it to make every file's stats get rebuilt. */
export const STATS_VERSION = 2

/** [value, count] pairs, highest count first. */
export type TopList = [string, number][]

/** Per-source-IP aggregate, kept for the busiest IPs so findings can say *why* an address stands out. */
export interface IpEntry {
  ip: string
  /** Events from this address. */
  n: number
  /** Of those, answered with 4xx/5xx. */
  err: number
  /** Of those, sent by an automated client (scanner / HTTP library / CLI tool). */
  auto: number
  /** Of those, requesting a sensitive path. */
  sens: number
  /** Of those, carrying an injection-style payload. */
  inj: number
  /** First automated client seen from this address ("sqlmap", "curl", ...). */
  tool: string | null
}

export interface PayloadCounts {
  SQL_INJECTION: number
  COMMAND_INJECTION: number
  XSS: number
}

/** Pre-computed aggregates for one imported file, so Dashboard/Analysis never rescan the logs table. */
export interface FileStats {
  fileId: number
  version: number
  computedAt: number
  totalEvents: number
  severity: Record<Severity, number>
  /** Events that look like failed authentication. */
  failedAuth: number
  /** Events per UTC minute: [minuteIndex (= floor(ms / 60000)), count], ascending. */
  timeline: [number, number][]
  /** Events that carry a user agent (the denominator for the "automated" share). */
  withUserAgent: number
  /** Events sent by an automated client. */
  automated: number
  /** Events requesting a sensitive path, and which paths those were. */
  sensitive: number
  sensitivePaths: TopList
  /** Events carrying each kind of injection-style payload (one event can carry several kinds). */
  payload: PayloadCounts
  /** The busiest source IPs with their indicator counts, busiest first. */
  ips: IpEntry[]
  /** HTTP status class per UTC minute: [minute, 2xx, 3xx, 4xx, 5xx], only minutes that have HTTP statuses. */
  timelineStatus: [number, number, number, number, number][]
  /** Most frequent values per field (exact unless a field has an extreme number of distinct values). `url` is counted without its query string. */
  top: {
    srcIp: TopList
    dstIp: TopList
    username: TopList
    eventType: TopList
    userAgent: TopList
    url: TopList
    status: TopList
    action: TopList
  }
}
