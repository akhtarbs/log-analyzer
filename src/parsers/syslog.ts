import type { Parser } from './types'
import { emptyFields, inferSeverity } from './types'

// Example: "Aug 14 08:21:01 server01 kernel: [12345.6789] eth0: link up"
const SYSLOG_RE =
  /^(\w{3}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2})\s+(\S+)\s+([\w./-]+)(?:\[(\d+)\])?:\s*(.*)$/

export const syslogParser: Parser = {
  name: 'linux_syslog',
  label: 'Linux Syslog',

  detect(sampleLines) {
    const hits = sampleLines.filter((l) => SYSLOG_RE.test(l)).length
    return sampleLines.length ? hits / sampleLines.length : 0
  },

  parseLine(line) {
    const m = line.match(SYSLOG_RE)
    if (!m) return null
    const [, ts, hostname, process, , message] = m
    const fields = emptyFields(line)
    const year = new Date().getFullYear()
    const parsed = new Date(`${ts} ${year}`)
    fields.timestamp = isNaN(parsed.getTime()) ? null : parsed.getTime()
    fields.timestampRaw = ts
    fields.hostname = hostname
    fields.process = process
    fields.message = message
    fields.logSource = 'syslog'
    fields.eventType = process ? process.toUpperCase() : 'SYSLOG'
    fields.severity = inferSeverity(fields.eventType, message)
    return fields
  },
}
