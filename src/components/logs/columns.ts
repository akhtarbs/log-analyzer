export interface ColumnDef {
  key: string
  label: string
  width: number
  /** Timestamp is always shown and can't be turned off. */
  mandatory?: boolean
  /** Rendered wider/truncated with monospace, used for long free-text fields. */
  wide?: boolean
}

// Order here also defines the default left-to-right order in the table.
export const ALL_COLUMNS: ColumnDef[] = [
  { key: 'timestamp', label: 'Timestamp', width: 168, mandatory: true },
  { key: 'severity', label: 'Severity', width: 90 },
  { key: 'eventType', label: 'Event', width: 170 },
  { key: 'srcIp', label: 'Source IP', width: 140 },
  { key: 'srcPort', label: 'Src Port', width: 80 },
  { key: 'dstIp', label: 'Destination IP', width: 140 },
  { key: 'dstPort', label: 'Dst Port', width: 80 },
  { key: 'protocol', label: 'Protocol', width: 90 },
  { key: 'username', label: 'Username', width: 110 },
  { key: 'hostname', label: 'Hostname', width: 130 },
  { key: 'action', label: 'Action', width: 90 },
  { key: 'status', label: 'Status', width: 90 },
  { key: 'url', label: 'URL / Path', width: 300, wide: true },
  { key: 'httpVersion', label: 'HTTP Version', width: 110 },
  { key: 'userAgent', label: 'User Agent / Browser', width: 240, wide: true },
  { key: 'referer', label: 'Referer', width: 200, wide: true },
  { key: 'requestBody', label: 'Request Body / Data Sent', width: 240, wide: true },
  { key: 'tags', label: 'Tags', width: 200, wide: true },
  { key: 'process', label: 'Process', width: 110 },
  { key: 'message', label: 'Message', width: 240, wide: true },
  { key: 'rawLog', label: 'Full Log (Raw)', width: 640, wide: true },
  { key: 'mark', label: 'Mark', width: 110 },
]

// Default view: when, who, what was requested, and the full original line.
export const DEFAULT_VISIBLE_COLUMNS = ['timestamp', 'srcIp', 'url', 'rawLog']

// v2: the default column set changed, so earlier saved selections are intentionally not carried over.
const STORAGE_KEY = 'log-analyzer:visible-columns-v2'

export function loadVisibleColumns(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_VISIBLE_COLUMNS
    const parsed = JSON.parse(raw) as string[]
    const valid = parsed.filter((k) => ALL_COLUMNS.some((c) => c.key === k))
    if (!valid.includes('timestamp')) valid.unshift('timestamp')
    return valid.length > 0 ? valid : DEFAULT_VISIBLE_COLUMNS
  } catch {
    return DEFAULT_VISIBLE_COLUMNS
  }
}

export function saveVisibleColumns(keys: string[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(keys))
}
