import Dexie, { type Table } from 'dexie'
import type {
  LogEvent,
  LogFile,
  Tag,
  LogTag,
  Investigation,
  InvestigationLog,
  Note,
  SavedFilter,
  DetectionRule,
  AppSettings,
  FileStats,
} from '../types'

// ---------------------------------------------------------------------------
// LogAnalyzerDB — the single IndexedDB database backing this entire app.
// All data lives on-device. Nothing is ever transmitted anywhere.
// ---------------------------------------------------------------------------
export class LogAnalyzerDB extends Dexie {
  logs!: Table<LogEvent, number>
  logFiles!: Table<LogFile, number>
  fileStats!: Table<FileStats, number>
  tags!: Table<Tag, number>
  logTags!: Table<LogTag, number>
  investigations!: Table<Investigation, number>
  investigationLogs!: Table<InvestigationLog, number>
  notes!: Table<Note, number>
  savedFilters!: Table<SavedFilter, number>
  detectionRules!: Table<DetectionRule, number>
  settings!: Table<AppSettings, number>

  constructor() {
    super('LogAnalyzerDB')

    this.version(1).stores({
      logs: '++id, fileId, timestamp, severity, eventType, srcIp, dstIp, username, hostname, mark, parser',
      logFiles: '++id, name, importedAt',
      tags: '++id, &name',
      logTags: '++id, logId, tagId, [logId+tagId]',
      investigations: '++id, &code, status, priority, createdAt',
      investigationLogs: '++id, investigationId, logId, [investigationId+logId]',
      notes: '++id, logId, createdAt',
      savedFilters: '++id, &name',
      detectionRules: '++id, &name, enabled',
      settings: '++id, &key',
    })

    // v2: log files can be individually included/excluded from analysis.
    // Note: "active" is intentionally NOT indexed — IndexedDB doesn't support
    // boolean values as index keys. The logFiles table is small (one row per
    // imported file), so a plain table scan to filter by active is cheap.
    this.version(2)
      .stores({
        logFiles: '++id, name, importedAt',
      })
      .upgrade(async (tx) => {
        await tx.table('logFiles').toCollection().modify((f: any) => {
          if (f.active === undefined) f.active = true
        })
      })

    // v3: per-file pre-computed statistics, and the `parser` index on logs is
    // dropped (the parser is a per-file property, and every extra index slows
    // down imports and grows storage on very large datasets).
    this.version(3).stores({
      logs: '++id, fileId, timestamp, severity, eventType, srcIp, dstIp, username, hostname, mark',
      fileStats: 'fileId',
    })
  }
}

export const db = new LogAnalyzerDB()

export const BUILTIN_TAGS = [
  { name: 'BRUTE_FORCE', color: '#f0555c' },
  { name: 'PORT_SCAN', color: '#ef9455' },
  { name: 'SQL_INJECTION', color: '#f0555c' },
  { name: 'XSS', color: '#ef9455' },
  { name: 'COMMAND_INJECTION', color: '#f0555c' },
  { name: 'SUSPICIOUS_IP', color: '#e0c15c' },
  { name: 'MALWARE', color: '#f0555c' },
  { name: 'DATA_EXFILTRATION', color: '#f0555c' },
  { name: 'FALSE_POSITIVE', color: '#7d8ea3' },
  { name: 'INVESTIGATE', color: '#5ab0f0' },
]

export async function ensureBuiltinTags() {
  const count = await db.tags.count()
  if (count > 0) return
  await db.tags.bulkAdd(BUILTIN_TAGS.map((t) => ({ ...t, builtin: true })))
}

export const BUILTIN_RULES: Omit<DetectionRule, 'id' | 'createdAt'>[] = [
  {
    name: 'SSH Brute Force',
    description: 'Many failed SSH logins from the same source IP in a short window.',
    enabled: true,
    builtin: true,
    conditionEventType: 'SSH_LOGIN_FAILED',
    groupByField: 'srcIp',
    thresholdCount: 10,
    windowSeconds: 300,
    resultSeverity: 'HIGH',
    resultTag: 'BRUTE_FORCE',
  },
  {
    name: 'Port Scan',
    description: 'A single source IP touching many destination ports quickly.',
    enabled: true,
    builtin: true,
    conditionEventType: 'PORT_SCAN',
    groupByField: 'srcIp',
    thresholdCount: 15,
    windowSeconds: 60,
    resultSeverity: 'HIGH',
    resultTag: 'PORT_SCAN',
  },
  {
    name: 'Web Scanning',
    description: 'Many HTTP 404/403 responses from the same source IP quickly.',
    enabled: true,
    builtin: true,
    conditionEventType: 'HTTP_404',
    groupByField: 'srcIp',
    thresholdCount: 20,
    windowSeconds: 60,
    resultSeverity: 'MEDIUM',
    resultTag: 'SUSPICIOUS_IP',
  },
]

export async function ensureBuiltinRules() {
  const count = await db.detectionRules.count()
  if (count > 0) return
  await db.detectionRules.bulkAdd(BUILTIN_RULES.map((r) => ({ ...r, createdAt: Date.now() })))
}

export async function initDb() {
  await ensureBuiltinTags()
  await ensureBuiltinRules()
}
