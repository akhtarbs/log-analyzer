import type { LogEvent } from '../types'

function downloadBlob(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

/** Saves arbitrary text as a file (used for small CSV exports such as an indicator list). */
export function downloadText(content: string, filename: string, mime = 'text/csv') {
  downloadBlob(content, filename, mime)
}

const CSV_COLUMNS: (keyof LogEvent)[] = [
  'timestamp', 'severity', 'eventType', 'srcIp', 'srcPort', 'dstIp', 'dstPort',
  'protocol', 'username', 'hostname', 'action', 'status', 'url', 'httpVersion',
  'userAgent', 'referer', 'requestBody', 'mark', 'message',
]

function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return ''
  const s = String(v)
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

export function exportCsv(logs: LogEvent[], filename = 'logs-export.csv') {
  const header = CSV_COLUMNS.join(',')
  const rows = logs.map((l) => CSV_COLUMNS.map((c) => csvEscape(l[c])).join(','))
  downloadBlob([header, ...rows].join('\n'), filename, 'text/csv')
}

export function exportJson(logs: LogEvent[], filename = 'logs-export.json') {
  downloadBlob(JSON.stringify(logs, null, 2), filename, 'application/json')
}

export function exportTxt(logs: LogEvent[], filename = 'logs-export.txt') {
  const lines = logs.map((l) => l.rawLog)
  downloadBlob(lines.join('\n'), filename, 'text/plain')
}
