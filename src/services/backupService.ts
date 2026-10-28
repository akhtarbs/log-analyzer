import JSZip from 'jszip'
import { db } from '../db/database'

const BACKUP_VERSION = 1

export interface BackupPayload {
  version: number
  createdAt: number
  logFiles: unknown[]
  marks: { logId: number; mark: string }[]
  tags: unknown[]
  logTags: unknown[]
  notes: unknown[]
  investigations: unknown[]
  investigationLogs: unknown[]
  savedFilters: unknown[]
  detectionRules: unknown[]
  settings: unknown[]
}

/**
 * Builds the backup payload. By design this excludes raw log event rows
 * (there can be millions) — it captures metadata, marks, tags, notes,
 * investigations, filters, rules and settings, which is what's actually
 * irreplaceable analyst work.
 */
export async function buildBackupPayload(): Promise<BackupPayload> {
  const [logFiles, tags, logTags, notes, investigations, investigationLogs, savedFilters, detectionRules, settings] =
    await Promise.all([
      db.logFiles.toArray(),
      db.tags.toArray(),
      db.logTags.toArray(),
      db.notes.toArray(),
      db.investigations.toArray(),
      db.investigationLogs.toArray(),
      db.savedFilters.toArray(),
      db.detectionRules.toArray(),
      db.settings.toArray(),
    ])

  const marks: { logId: number; mark: string }[] = []
  // The mark index only contains marked rows, so this doesn't walk the whole (possibly huge) logs table.
  await db.logs
    .where('mark')
    .anyOf(['CRITICAL', 'SUSPICIOUS', 'REVIEW', 'BENIGN', 'INFO'])
    .each((l) => {
      if (l.mark) marks.push({ logId: l.id!, mark: l.mark })
    })

  return {
    version: BACKUP_VERSION,
    createdAt: Date.now(),
    logFiles: logFiles.map((f) => ({ ...f, originalContent: undefined })),
    marks,
    tags,
    logTags,
    notes,
    investigations,
    investigationLogs,
    savedFilters,
    detectionRules,
    settings,
  }
}

export async function exportBackup(includeOriginalFiles: boolean) {
  const payload = await buildBackupPayload()

  if (!includeOriginalFiles) {
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    triggerDownload(blob, 'log-analyzer-backup.json')
    return
  }

  const zip = new JSZip()
  zip.file('backup.json', JSON.stringify(payload, null, 2))
  const filesWithContent = await db.logFiles.filter((f) => Boolean(f.storeOriginal && f.originalContent)).toArray()
  const rawFolder = zip.folder('raw-logs')
  for (const f of filesWithContent) {
    rawFolder?.file(f.name, f.originalContent ?? '')
  }
  const blob = await zip.generateAsync({ type: 'blob' })
  triggerDownload(blob, 'log-analyzer-backup.zip')
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export type RestoreMode = 'merge' | 'replace'

export async function restoreBackup(file: File, mode: RestoreMode) {
  let payload: BackupPayload

  if (file.name.endsWith('.zip')) {
    const zip = await JSZip.loadAsync(file)
    const backupEntry = zip.file('backup.json')
    if (!backupEntry) throw new Error('backup.json not found inside archive')
    payload = JSON.parse(await backupEntry.async('text'))
  } else {
    payload = JSON.parse(await file.text())
  }

  await db.transaction(
    'rw',
    [db.logFiles, db.fileStats, db.tags, db.logTags, db.notes, db.investigations, db.investigationLogs, db.savedFilters, db.detectionRules, db.settings, db.logs],
    async () => {
      if (mode === 'replace') {
        await Promise.all([
          db.logFiles.clear(),
          db.fileStats.clear(),
          db.tags.clear(),
          db.logTags.clear(),
          db.notes.clear(),
          db.investigations.clear(),
          db.investigationLogs.clear(),
          db.savedFilters.clear(),
          db.detectionRules.clear(),
          db.settings.clear(),
        ])
      }

      await db.logFiles.bulkPut(payload.logFiles as any)
      await db.tags.bulkPut(payload.tags as any)
      await db.logTags.bulkPut(payload.logTags as any)
      await db.notes.bulkPut(payload.notes as any)
      await db.investigations.bulkPut(payload.investigations as any)
      await db.investigationLogs.bulkPut(payload.investigationLogs as any)
      await db.savedFilters.bulkPut(payload.savedFilters as any)
      await db.detectionRules.bulkPut(payload.detectionRules as any)
      await db.settings.bulkPut(payload.settings as any)

      for (const m of payload.marks) {
        await db.logs.update(m.logId, { mark: m.mark as any })
      }
    },
  )
}
