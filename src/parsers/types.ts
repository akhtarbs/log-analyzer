import type { LogEvent, ParserName, Severity } from '../types'

export type ParsedFields = Omit<LogEvent, 'id' | 'fileId' | 'rawLog' | 'parser' | 'mark' | 'lineNumber'>

export interface Parser {
  name: ParserName
  label: string
  /** Cheap heuristic check used for auto-detection against a sample of lines. */
  detect(sampleLines: string[]): number // returns a confidence score 0-1
  /** Parse a single line/record into normalized fields. */
  parseLine(line: string): ParsedFields | null
}

export function emptyFields(raw: string): ParsedFields {
  return {
    timestamp: null,
    timestampRaw: null,
    hostname: null,
    logSource: null,
    eventType: null,
    severity: 'INFO',
    srcIp: null,
    srcPort: null,
    dstIp: null,
    dstPort: null,
    protocol: null,
    username: null,
    process: null,
    action: null,
    status: null,
    message: raw,
    url: null,
    httpVersion: null,
    userAgent: null,
    referer: null,
    requestBody: null,
  }
}

export function inferSeverity(eventType: string | null, status: string | null): Severity {
  const s = `${eventType ?? ''} ${status ?? ''}`.toLowerCase()
  if (/injection|malware|exfil|critical/.test(s)) return 'CRITICAL'
  if (/fail|denied|error|refused|scan|attack|unauthorized|403|500/.test(s)) return 'HIGH'
  if (/warn|retry|timeout|404/.test(s)) return 'MEDIUM'
  if (/success|accept|ok|200|301|302/.test(s)) return 'INFO'
  return 'LOW'
}

const IP_RE = /\b(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\b/
export function extractIp(text: string): string | null {
  const m = text.match(IP_RE)
  return m ? m[1] : null
}

const MONTHS: Record<string, number> = {
  Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
}

/**
 * Parses Apache/Nginx "Combined Log Format" timestamps, e.g. "04/Aug/2026:08:02:14 +0700".
 * Implemented with an explicit regex + Date.UTC instead of handing a mangled
 * string to `new Date(...)`, which silently drops the seconds field and is
 * otherwise unreliable across JS engines for this non-ISO format.
 */
export function parseApacheTimestamp(ts: string): number | null {
  const m = ts.match(/^(\d{2})\/(\w{3})\/(\d{4}):(\d{2}):(\d{2}):(\d{2})(?:\s+([+-]\d{4}))?$/)
  if (!m) return null
  const [, dd, mon, yyyy, hh, mi, ss, tz] = m
  const month = MONTHS[mon]
  if (month === undefined) return null
  let ms = Date.UTC(Number(yyyy), month, Number(dd), Number(hh), Number(mi), Number(ss))
  if (tz) {
    const sign = tz[0] === '-' ? -1 : 1
    const tzHours = Number(tz.slice(1, 3))
    const tzMinutes = Number(tz.slice(3, 5))
    ms -= sign * (tzHours * 60 + tzMinutes) * 60000
  }
  return ms
}
