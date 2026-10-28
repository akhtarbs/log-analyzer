import type { Parser } from './types'
import { emptyFields, extractIp, inferSeverity } from './types'

const TS_RE = /^\[?(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2})/

export const genericParser: Parser = {
  name: 'generic',
  label: 'Generic Log',

  detect() {
    // Always available as a fallback with the lowest priority.
    return 0.01
  },

  parseLine(line) {
    const fields = emptyFields(line)
    const tsMatch = line.match(TS_RE)
    if (tsMatch) {
      fields.timestampRaw = tsMatch[1]
      const parsed = Date.parse(tsMatch[1])
      fields.timestamp = isNaN(parsed) ? null : parsed
    }
    fields.srcIp = extractIp(line)
    fields.logSource = 'generic'
    fields.eventType = 'LOG_LINE'
    fields.severity = inferSeverity(null, line)
    return fields
  },
}
