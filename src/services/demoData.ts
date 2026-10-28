import { db } from '../db/database'
import { StatsAccumulator } from '../analysis/aggregate'
import type { LogEvent, Severity } from '../types'

const EVENT_TYPES: { type: string; severity: Severity; weight: number }[] = [
  { type: 'SSH_LOGIN_FAILED', severity: 'MEDIUM', weight: 18 },
  { type: 'SSH_LOGIN_SUCCESS', severity: 'INFO', weight: 8 },
  { type: 'HTTP_200', severity: 'INFO', weight: 30 },
  { type: 'HTTP_404', severity: 'MEDIUM', weight: 15 },
  { type: 'HTTP_403', severity: 'HIGH', weight: 10 },
  { type: 'HTTP_500', severity: 'HIGH', weight: 5 },
  { type: 'PORT_SCAN', severity: 'HIGH', weight: 6 },
  { type: 'SQL_INJECTION', severity: 'CRITICAL', weight: 3 },
  { type: 'COMMAND_INJECTION', severity: 'CRITICAL', weight: 2 },
  { type: 'NORMAL_TRAFFIC', severity: 'LOW', weight: 3 },
]

const USERS = ['root', 'admin', 'ubuntu', 'deploy', 'test', 'www-data']
const HOSTS = ['server01', 'server02', 'web-prod-01', 'db-prod-01']
const ATTACKER_IPS = ['203.0.113.45', '198.51.100.23', '192.0.2.88']
const NORMAL_IPS = ['10.0.0.5', '10.0.0.12', '172.16.0.9', '192.168.1.20']
const URLS = ['/login', '/api/users', '/dashboard', '/api/orders', '/admin', '/checkout', '/api/search']
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15',
  'curl/8.4.0',
  'python-requests/2.31.0',
  'sqlmap/1.7#stable',
]
const REFERERS: (string | null)[] = ['https://example.com/home', 'https://example.com/products', null, null]

function weightedPick() {
  const total = EVENT_TYPES.reduce((s, e) => s + e.weight, 0)
  let r = Math.random() * total
  for (const e of EVENT_TYPES) {
    if (r < e.weight) return e
    r -= e.weight
  }
  return EVENT_TYPES[0]
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

export async function generateDemoData(count = 1000): Promise<number> {
  const fileId = await db.logFiles.add({
    name: 'demo-data.log',
    size: 0,
    importedAt: Date.now(),
    eventCount: count,
    parser: 'generic',
    processingTimeMs: 0,
    storeOriginal: false,
    active: true,
  })

  const now = Date.now()
  const events: LogEvent[] = []

  // Inject a clear brute-force burst so the detection engine has something real to find.
  const burstStart = now - 45 * 60 * 1000
  for (let i = 0; i < 40; i++) {
    events.push(
      buildEvent(fileId, burstStart + i * 3000, 'SSH_LOGIN_FAILED', 'MEDIUM', {
        srcIp: ATTACKER_IPS[0],
        dstIp: NORMAL_IPS[0],
        username: 'root',
        message: 'Failed password for root',
      }),
    )
  }

  for (let i = 0; i < count - 40; i++) {
    const ts = now - Math.floor(Math.random() * 60 * 60 * 1000)
    const picked = weightedPick()
    const isAttacker = Math.random() < 0.15
    events.push(
      buildEvent(fileId, ts, picked.type, picked.severity, {
        srcIp: isAttacker ? pick(ATTACKER_IPS) : pick(NORMAL_IPS),
        dstIp: pick(NORMAL_IPS),
        username: pick(USERS),
        message: `${picked.type.replace(/_/g, ' ').toLowerCase()} event`,
      }),
    )
  }

  events.sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0))
  events.forEach((e, i) => (e.lineNumber = i + 1))

  await db.logs.bulkAdd(events)

  const acc = new StatsAccumulator()
  for (const e of events) acc.add(e)
  await db.fileStats.put(acc.finish(fileId))
  return fileId
}

function buildEvent(
  fileId: number,
  timestamp: number,
  eventType: string,
  severity: Severity,
  extra: { srcIp: string; dstIp: string; username: string; message: string },
): LogEvent {
  const isHttp = eventType.startsWith('HTTP') || eventType === 'SQL_INJECTION' || eventType === 'COMMAND_INJECTION'
  const url = isHttp ? pick(URLS) + (eventType === 'SQL_INJECTION' ? "?id=1' OR 1=1--" : '') : null
  const userAgent = isHttp ? pick(USER_AGENTS) : null
  const referer = isHttp ? pick(REFERERS) : null
  const requestBody =
    eventType === 'SQL_INJECTION'
      ? JSON.stringify({ query: "SELECT * FROM users WHERE id=1 OR 1=1" })
      : eventType === 'COMMAND_INJECTION'
        ? JSON.stringify({ cmd: 'cat /etc/passwd' })
        : isHttp && Math.random() < 0.2
          ? JSON.stringify({ action: 'submit', field: 'value' })
          : null

  return {
    fileId,
    timestamp,
    timestampRaw: new Date(timestamp).toISOString(),
    hostname: pick(HOSTS),
    logSource: 'demo',
    eventType,
    severity,
    srcIp: extra.srcIp,
    srcPort: 1024 + Math.floor(Math.random() * 60000),
    dstIp: extra.dstIp,
    dstPort: pick([22, 80, 443, 3306, 8080]),
    protocol: 'TCP',
    username: extra.username,
    process: 'demo',
    action: eventType.startsWith('HTTP') ? 'REQUEST' : 'EVENT',
    status: severity === 'INFO' ? 'SUCCESS' : severity === 'CRITICAL' || severity === 'HIGH' ? 'FAILED' : 'INFO',
    message: extra.message,
    rawLog: `[${new Date(timestamp).toISOString()}] ${eventType} src=${extra.srcIp} dst=${extra.dstIp} user=${extra.username} — ${extra.message}`,
    mark: null,
    lineNumber: 0,
    url,
    httpVersion: isHttp ? 'HTTP/1.1' : null,
    userAgent,
    referer,
    requestBody,
  }
}
