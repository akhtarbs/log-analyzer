import type { Parser } from './types'
import { emptyFields, extractIp } from './types'

// Example: "Aug 14 08:21:01 server sshd[1234]: Failed password for root from 192.168.1.20 port 52122 ssh2"
const AUTH_RE = /^(\w{3}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2})\s+(\S+)\s+sshd(?:\[(\d+)\])?:\s*(.*)$/

export const authParser: Parser = {
  name: 'linux_auth',
  label: 'Linux Auth Log',

  detect(sampleLines) {
    const hits = sampleLines.filter((l) => /sshd(\[\d+\])?:/.test(l)).length
    return sampleLines.length ? hits / sampleLines.length : 0
  },

  parseLine(line) {
    const m = line.match(AUTH_RE)
    if (!m) return null
    const [, ts, hostname, , message] = m
    const fields = emptyFields(line)
    const year = new Date().getFullYear()
    const parsed = new Date(`${ts} ${year}`)
    fields.timestamp = isNaN(parsed.getTime()) ? null : parsed.getTime()
    fields.timestampRaw = ts
    fields.hostname = hostname
    fields.process = 'sshd'
    fields.message = message
    fields.logSource = 'auth'
    fields.srcIp = extractIp(message)

    const portMatch = message.match(/port (\d+)/)
    fields.srcPort = portMatch ? parseInt(portMatch[1], 10) : null

    const userMatch = message.match(/for (?:invalid user )?(\S+) from/)
    fields.username = userMatch ? userMatch[1] : null

    if (/Failed password/i.test(message)) {
      fields.eventType = 'SSH_LOGIN_FAILED'
      fields.status = 'FAILED'
      fields.severity = 'MEDIUM'
    } else if (/Accepted password|Accepted publickey/i.test(message)) {
      fields.eventType = 'SSH_LOGIN_SUCCESS'
      fields.status = 'SUCCESS'
      fields.severity = 'INFO'
    } else if (/Invalid user/i.test(message)) {
      fields.eventType = 'SSH_INVALID_USER'
      fields.status = 'FAILED'
      fields.severity = 'MEDIUM'
    } else if (/session opened/i.test(message)) {
      fields.eventType = 'SSH_SESSION_OPENED'
      fields.status = 'SUCCESS'
      fields.severity = 'INFO'
    } else if (/session closed/i.test(message)) {
      fields.eventType = 'SSH_SESSION_CLOSED'
      fields.status = 'INFO'
      fields.severity = 'INFO'
    } else {
      fields.eventType = 'SSH_EVENT'
      fields.severity = 'LOW'
    }

    fields.action = 'LOGIN'
    return fields
  },
}
