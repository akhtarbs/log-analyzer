import type { Parser } from './types'
import { emptyFields, inferSeverity } from './types'

function pick(obj: Record<string, unknown>, keys: string[]): unknown {
  for (const k of keys) {
    if (obj[k] !== undefined && obj[k] !== null) return obj[k]
  }
  return null
}

function toStr(v: unknown): string | null {
  if (v === null || v === undefined) return null
  return String(v)
}

function toNum(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return isNaN(n) ? null : n
}

function parseJsonLine(line: string) {
  let obj: Record<string, unknown>
  try {
    obj = JSON.parse(line)
  } catch {
    return null
  }
  if (typeof obj !== 'object' || obj === null) return null

  const fields = emptyFields(line)
  const ts = pick(obj, ['timestamp', 'time', '@timestamp', 'ts', 'datetime'])
  if (ts) {
    fields.timestampRaw = String(ts)
    const num = typeof ts === 'number' ? (ts > 1e12 ? ts : ts * 1000) : Date.parse(String(ts))
    fields.timestamp = isNaN(num) ? null : num
  }
  fields.hostname = toStr(pick(obj, ['hostname', 'host']))
  fields.logSource = toStr(pick(obj, ['source', 'logSource', 'log_source'])) ?? 'json'
  fields.eventType = toStr(pick(obj, ['eventType', 'event_type', 'event']))
  fields.srcIp = toStr(pick(obj, ['srcIp', 'src_ip', 'source_ip', 'ip']))
  fields.srcPort = toNum(pick(obj, ['srcPort', 'src_port']))
  fields.dstIp = toStr(pick(obj, ['dstIp', 'dst_ip', 'destination_ip']))
  fields.dstPort = toNum(pick(obj, ['dstPort', 'dst_port']))
  fields.protocol = toStr(pick(obj, ['protocol', 'proto']))
  fields.username = toStr(pick(obj, ['username', 'user']))
  fields.process = toStr(pick(obj, ['process', 'program']))
  fields.action = toStr(pick(obj, ['action']))
  fields.status = toStr(pick(obj, ['status', 'statusCode', 'status_code']))
  fields.message = toStr(pick(obj, ['message', 'msg'])) ?? line
  fields.url = toStr(pick(obj, ['url', 'path', 'uri', 'request_uri', 'endpoint']))
  fields.httpVersion = toStr(pick(obj, ['httpVersion', 'http_version', 'protocolVersion']))
  fields.userAgent = toStr(pick(obj, ['userAgent', 'user_agent', 'ua', 'agent']))
  fields.referer = toStr(pick(obj, ['referer', 'referrer']))
  const bodyRaw = pick(obj, ['body', 'requestBody', 'request_body', 'payload', 'data'])
  fields.requestBody = bodyRaw === null ? null : typeof bodyRaw === 'string' ? bodyRaw : JSON.stringify(bodyRaw)
  const sevRaw = toStr(pick(obj, ['severity', 'level']))
  fields.severity = sevRaw
    ? (['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO'].includes(sevRaw.toUpperCase())
        ? (sevRaw.toUpperCase() as any)
        : inferSeverity(fields.eventType, fields.status))
    : inferSeverity(fields.eventType, fields.status)
  return fields
}

export const jsonlParser: Parser = {
  name: 'jsonl',
  label: 'JSONL (newline-delimited JSON)',
  detect(sampleLines) {
    const hits = sampleLines.filter((l) => l.trim().startsWith('{') && parseJsonLine(l) !== null).length
    return sampleLines.length ? hits / sampleLines.length : 0
  },
  parseLine: parseJsonLine,
}

export const jsonParser: Parser = {
  name: 'json',
  label: 'JSON',
  // Real JSON-array files are handled specially in the worker (not line-by-line);
  // this detector exists mainly so auto-detect can recognize a single JSON object per line too.
  detect(sampleLines) {
    const joined = sampleLines.join('').trim()
    return joined.startsWith('[') || joined.startsWith('{') ? 0.5 : 0
  },
  parseLine: parseJsonLine,
}
