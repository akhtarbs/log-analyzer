import type { Parser } from './types'
import { emptyFields, inferSeverity } from './types'

export function splitCsvLine(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        cur += c
      }
    } else if (c === '"') {
      inQuotes = true
    } else if (c === ',') {
      out.push(cur)
      cur = ''
    } else {
      cur += c
    }
  }
  out.push(cur)
  return out
}

let cachedHeader: string[] | null = null

export function setCsvHeader(header: string[]) {
  cachedHeader = header.map((h) => h.trim().toLowerCase())
}

export function resetCsvHeader() {
  cachedHeader = null
}

export const csvParser: Parser = {
  name: 'csv',
  label: 'CSV',

  detect(sampleLines) {
    if (sampleLines.length < 2) return 0
    const commaCounts = sampleLines.slice(0, 10).map((l) => (l.match(/,/g) || []).length)
    const consistent = commaCounts.every((c) => c === commaCounts[0] && c > 0)
    return consistent ? 0.6 : 0
  },

  parseLine(line) {
    if (!cachedHeader) return null
    const cells = splitCsvLine(line)
    const row: Record<string, string> = {}
    cachedHeader.forEach((h, i) => {
      row[h] = cells[i] ?? ''
    })
    const fields = emptyFields(line)
    fields.timestampRaw = row.timestamp || row.time || row.date || null
    if (fields.timestampRaw) {
      const parsed = Date.parse(fields.timestampRaw)
      fields.timestamp = isNaN(parsed) ? null : parsed
    }
    fields.hostname = row.hostname || row.host || null
    fields.eventType = row.eventtype || row.event_type || row.event || null
    fields.srcIp = row.srcip || row.src_ip || row.source_ip || row.ip || null
    fields.srcPort = row.srcport ? Number(row.srcport) || null : null
    fields.dstIp = row.dstip || row.dst_ip || null
    fields.dstPort = row.dstport ? Number(row.dstport) || null : null
    fields.protocol = row.protocol || null
    fields.username = row.username || row.user || null
    fields.action = row.action || null
    fields.status = row.status || null
    fields.message = row.message || row.msg || line
    fields.logSource = 'csv'
    fields.severity = inferSeverity(fields.eventType, fields.status)
    fields.url = row.url || row.path || row.uri || null
    fields.httpVersion = row.httpversion || row.http_version || null
    fields.userAgent = row.useragent || row.user_agent || row.ua || null
    fields.referer = row.referer || row.referrer || null
    fields.requestBody = row.body || row.requestbody || row.payload || null
    return fields
  },
}
