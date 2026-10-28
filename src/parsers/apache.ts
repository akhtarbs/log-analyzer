import type { Parser } from './types'
import { emptyFields, inferSeverity, parseApacheTimestamp } from './types'

// Combined Log Format:
// 127.0.0.1 - frank [10/Oct/2023:13:55:36 -0700] "GET /apache_pb.gif HTTP/1.0" 200 2326 "http://ref.com" "Mozilla/5.0"
// The trailing referer/user-agent fields are optional (Common Log Format omits them).
const ACCESS_RE =
  /^(\S+)\s+\S+\s+(\S+)\s+\[([^\]]+)\]\s+"(\S+)\s+(\S+)\s+([^"]+)"\s+(\d{3})\s+(\S+)(?:\s+"([^"]*)"\s+"([^"]*)")?/

export const apacheAccessParser: Parser = {
  name: 'apache_access',
  label: 'Apache Access Log',

  detect(sampleLines) {
    const hits = sampleLines.filter((l) => ACCESS_RE.test(l)).length
    return sampleLines.length ? hits / sampleLines.length : 0
  },

  parseLine(line) {
    const m = line.match(ACCESS_RE)
    if (!m) return null
    const [, ip, user, ts, method, path, httpVersion, status, , referer, userAgent] = m
    const fields = emptyFields(line)
    fields.srcIp = ip
    fields.username = user !== '-' ? user : null
    fields.timestampRaw = ts
    fields.timestamp = parseApacheTimestamp(ts)
    fields.action = method
    fields.message = `${method} ${path} -> ${status}`
    fields.status = status
    fields.logSource = 'apache_access'
    fields.eventType = `HTTP_${status}`
    fields.severity = inferSeverity(fields.eventType, status)
    fields.url = path
    fields.httpVersion = httpVersion?.trim() || null
    fields.referer = referer && referer !== '-' ? referer : null
    fields.userAgent = userAgent && userAgent !== '-' ? userAgent : null
    return fields
  },
}

// [Wed Oct 11 14:32:52 2023] [error] [client 192.168.1.10] File does not exist: /var/www/favicon.ico
const ERROR_RE = /^\[([^\]]+)\]\s+\[(\w+)\]\s+(?:\[client\s+([\d.]+)\]\s+)?(.*)$/

export const apacheErrorParser: Parser = {
  name: 'apache_error',
  label: 'Apache Error Log',

  detect(sampleLines) {
    const hits = sampleLines.filter((l) => ERROR_RE.test(l) && /\[error\]|\[warn\]|\[notice\]/.test(l)).length
    return sampleLines.length ? hits / sampleLines.length : 0
  },

  parseLine(line) {
    const m = line.match(ERROR_RE)
    if (!m) return null
    const [, ts, level, ip, message] = m
    const fields = emptyFields(line)
    fields.timestampRaw = ts
    const parsed = new Date(ts)
    fields.timestamp = isNaN(parsed.getTime()) ? null : parsed.getTime()
    fields.srcIp = ip ?? null
    fields.message = message
    fields.logSource = 'apache_error'
    fields.eventType = `APACHE_${level.toUpperCase()}`
    fields.severity = level.toLowerCase() === 'error' ? 'HIGH' : level.toLowerCase() === 'warn' ? 'MEDIUM' : 'LOW'
    return fields
  },
}
