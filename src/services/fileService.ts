import { db } from '../db/database'
import type { LogFile } from '../types'
import type { TaskHandle } from './progress'

export async function listLogFiles(): Promise<LogFile[]> {
  return db.logFiles.orderBy('importedAt').reverse().toArray()
}

/** File IDs currently included in analysis (dashboard stats, analysis page, detection rules, IP lookups). */
export async function getActiveFileIdSet(): Promise<Set<number>> {
  const all = await db.logFiles.toArray()
  return new Set(all.filter((f) => f.active).map((f) => f.id!))
}

export async function hasExcludedFiles(): Promise<boolean> {
  const total = await db.logFiles.count()
  if (total === 0) return false
  const activeIds = await getActiveFileIdSet()
  return activeIds.size < total
}

export async function setFileActive(fileId: number, active: boolean) {
  await db.logFiles.update(fileId, { active })
}

const DELETE_BATCH = 5000

/**
 * Removes tags, notes and investigation links that point at rows of one file.
 * Annotations are few compared with log rows, so this walks the (small) annotation
 * tables and looks up which file each referenced row belongs to — instead of matching
 * millions of row ids against them.
 */
async function deleteAnnotationsOfFile(fileId: number) {
  for (const table of [db.logTags, db.notes, db.investigationLogs] as const) {
    const rows = await (table as typeof db.notes).toArray()
    if (rows.length === 0) continue
    const logIds = [...new Set(rows.map((r) => r.logId))]
    const logs = await db.logs.bulkGet(logIds)
    const inFile = new Set<number>()
    logs.forEach((l, i) => {
      if (l && l.fileId === fileId) inFile.add(logIds[i])
    })
    const doomed = rows.filter((r) => inFile.has(r.logId)).map((r) => r.id!)
    if (doomed.length > 0) await (table as typeof db.notes).bulkDelete(doomed)
  }
}

/**
 * Deletes a file and everything attached to it. Rows are removed in batches (rather than
 * one giant transaction) so a file with millions of rows can be deleted with visible
 * progress and without loading all of its ids into memory.
 */
export async function deleteLogFile(fileId: number, task?: TaskHandle, batchSize = DELETE_BATCH) {
  const file = await db.logFiles.get(fileId)
  const total = file?.eventCount ?? 0

  await deleteAnnotationsOfFile(fileId)

  let removed = 0
  let previousFirst: number | undefined
  while (true) {
    const ids = await db.logs.where('fileId').equals(fileId).limit(batchSize).primaryKeys()
    if (ids.length === 0) break
    if (ids[0] === previousFirst) throw new Error('Deleting log rows made no progress')
    previousFirst = ids[0]
    await db.logs.bulkDelete(ids)
    removed += ids.length
    task?.update(total > 0 ? (removed / total) * 100 : null, `${removed.toLocaleString()} / ${total.toLocaleString()} events removed`)
  }

  await db.fileStats.delete(fileId)
  await db.logFiles.delete(fileId)
}
