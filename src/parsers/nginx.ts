import type { Parser } from './types'
import { emptyFields, inferSeverity, parseApacheTimestamp } from './types'

// 192.168.1.20 - - [14/Aug/2026:08:21:01 +0000] "GET /login HTTP/1.1" 403 162 "http://ref.com" "curl/8.0"
const ACCESS_RE = /^(\S+)\s+\S+\s+\S+\s+\[([^\]]+)\]\s+"(\S+)\s+(\S+)\s+([^"]+)"\s+(\d{3})\s+(\S+)(?:\s+"([^"]*)"\s+"([^"]*)")?/

export const nginxAccessParser: Parser = {
  name: 'nginx_access',
  label: 'Nginx Access Log',

  detect(sampleLines) {
    const hits = sampleLines.filter((l) => ACCESS_RE.test(l)).length
    return sampleLines.length ? hits / sampleLines.length : 0
  },

  parseLine(line) {
    const m = line.match(ACCESS_RE)
    if (!m) return null
    const [, ip, ts, method, path, httpVersion, status, , referer, userAgent] = m
    const fields = emptyFields(line)
    fields.srcIp = ip
    fields.timestampRaw = ts
    fields.timestamp = parseApacheTimestamp(ts)
    fields.action = method
    fields.status = status
    fields.message = `${method} ${path} -> ${status}`
    fields.logSource = 'nginx_access'
    fields.eventType = `HTTP_${status}`
    fields.severity = inferSeverity(fields.eventType, status)
    fields.url = path
    fields.httpVersion = httpVersion?.trim() || null
    fields.referer = referer && referer !== '-' ? referer : null
    fields.userAgent = userAgent && userAgent !== '-' ? userAgent : null
    return fields
  },
}

// 2026/08/14 08:21:01 [error] 1234#0: *1 connect() failed (111: Connection refused) while connecting to upstream, client: 192.168.1.20
const ERROR_RE = /^(\d{4}\/\d{2}\/\d{2}\s+\d{2}:\d{2}:\d{2})\s+\[(\w+)\]\s+(.*)$/

export const nginxErrorParser: Parser = {
  name: 'nginx_error',
  label: 'Nginx Error Log',

  detect(sampleLines) {
    const hits = sampleLines.filter((l) => ERROR_RE.test(l)).length
    return sampleLines.length ? hits / sampleLines.length : 0
  },

  parseLine(line) {
    const m = line.match(ERROR_RE)
    if (!m) return null
    const [, ts, level, message] = m
    const fields = emptyFields(line)
    fields.timestampRaw = ts
    const parsed = new Date(ts.replace(/\//g, '-'))
    fields.timestamp = isNaN(parsed.getTime()) ? null : parsed.getTime()
    const ipMatch = message.match(/client:\s*([\d.]+)/)
    fields.srcIp = ipMatch ? ipMatch[1] : null
    fields.message = message
    fields.logSource = 'nginx_error'
    fields.eventType = `NGINX_${level.toUpperCase()}`
    fields.severity = level.toLowerCase() === 'error' || level.toLowerCase() === 'crit' ? 'HIGH' : 'MEDIUM'
    return fields
  },
}
