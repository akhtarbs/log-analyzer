// ---------------------------------------------------------------------------
// Statistics service: reads / builds the per-file aggregates (FileStats) that
// Dashboard and Analysis are drawn from. New imports get their stats for free
// (computed in the parser worker); files imported before this existed are
// backfilled once by scanning them, after which the result is persisted.
// ---------------------------------------------------------------------------
import { db } from '../db/database'
import { STATS_VERSION, type FileStats, type LogFile, type MarkType, type Severity } from '../types'
import {
  StatsAccumulator,
  chooseBucketMinutes,
  mergeStats,
  rebucketTimeline,
  type MergedStats,
} from '../analysis/aggregate'
import { createScanTicker, scanShouldStop, throwIfCancelled, type TaskHandle } from './progress'
import { getActiveFileIdSet } from './fileService'

const MARKS: Exclude<MarkType, null>[] = ['CRITICAL', 'SUSPICIOUS', 'REVIEW', 'BENIGN', 'INFO']

function isCurrent(stats: FileStats | undefined, file: LogFile): stats is FileStats {
  return Boolean(stats) && stats!.version === STATS_VERSION && stats!.totalEvents === file.eventCount
}

/** Files whose stored statistics are missing, outdated, or disagree with the file's event count. */
export async function filesNeedingStats(): Promise<LogFile[]> {
  const files = await db.logFiles.toArray()
  const stats = await db.fileStats.bulkGet(files.map((f) => f.id!))
  return files.filter((f, i) => !isCurrent(stats[i], f))
}

/** Scans one file's rows (via the fileId index) and stores its statistics. */
export async function buildFileStats(
  file: LogFile,
  task?: TaskHandle,
  progress?: (eventsScanned: number) => void,
): Promise<FileStats> {
  const acc = new StatsAccumulator()
  const tick = createScanTicker(file.eventCount, task)
  await db.logs
    .where('fileId')
    .equals(file.id!)
    .until(scanShouldStop(task))
    .each((log) => {
      acc.add(log)
      tick()
      if (progress && acc.count % 1000 === 0) progress(acc.count)
    })
  throwIfCancelled(task)
  const stats = acc.finish(file.id!)
  await db.fileStats.put(stats)
  if (file.eventCount !== stats.totalEvents) await db.logFiles.update(file.id!, { eventCount: stats.totalEvents })
  return stats
}

/**
 * Makes sure every file has current statistics, building the missing ones.
 * Returns how many files had to be built (0 = nothing to do, instant).
 */
export async function ensureStats(task?: TaskHandle): Promise<number> {
  const todo = await filesNeedingStats()
  if (todo.length === 0) return 0

  const totalEvents = todo.reduce((sum, f) => sum + f.eventCount, 0)
  let done = 0
  for (let i = 0; i < todo.length; i++) {
    const file = todo[i]
    task?.update(
      totalEvents > 0 ? (done / totalEvents) * 100 : null,
      `Building statistics: ${file.name} (${i + 1}/${todo.length})`,
    )
    await buildFileStats(file, task, (scanned) => {
      if (task && totalEvents > 0) task.update(((done + scanned) / totalEvents) * 100)
    })
    done += file.eventCount
  }
  return todo.length
}

/** Forces a rebuild of all statistics (e.g. from Settings). */
export async function rebuildAllStats(task?: TaskHandle): Promise<number> {
  await db.fileStats.clear()
  return ensureStats(task)
}

/** Events across the files currently included in analysis, without touching the logs table. */
export async function getTotalActiveEvents(): Promise<number> {
  const files = await db.logFiles.toArray()
  return files.filter((f) => f.active).reduce((sum, f) => sum + f.eventCount, 0)
}

/** Marked events in included files. Uses the `mark` index, which only contains marked rows. */
export async function countMarkedActive(): Promise<number> {
  const active = await getActiveFileIdSet()
  if (active.size === 0) return 0
  return db.logs
    .where('mark')
    .anyOf(MARKS)
    .filter((l) => active.has(l.fileId))
    .count()
}

export async function getMergedActiveStats(): Promise<MergedStats> {
  const active = [...(await getActiveFileIdSet())]
  const rows = (await db.fileStats.bulkGet(active)).filter((s): s is FileStats => Boolean(s))
  return mergeStats(rows)
}

// ---------------------------------------------------------------------------
// What the Dashboard shows
// ---------------------------------------------------------------------------

export interface DashboardStats {
  totalEvents: number
  critical: number
  high: number
  medium: number
  low: number
  info: number
  marked: number
  topSourceIps: { key: string; count: number }[]
  timeline: { bucket: number; count: number }[]
  bucketMinutes: number
}

export async function getDashboardStats(offsetMinutes = 0): Promise<DashboardStats> {
  const [merged, marked] = await Promise.all([getMergedActiveStats(), countMarkedActive()])
  const bucketMinutes = chooseBucketMinutes(merged.timeline)
  const sev = (s: Severity) => merged.severity[s]
  return {
    totalEvents: merged.totalEvents,
    critical: sev('CRITICAL'),
    high: sev('HIGH'),
    medium: sev('MEDIUM'),
    low: sev('LOW'),
    info: sev('INFO'),
    marked,
    topSourceIps: merged.top.srcIp.slice(0, 10).map(([key, count]) => ({ key, count })),
    timeline: rebucketTimeline(merged.timeline, bucketMinutes, offsetMinutes).map((b) => ({ bucket: b.startMs, count: b.count })),
    bucketMinutes,
  }
}
