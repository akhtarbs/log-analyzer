import { db } from '../db/database'
import { RuleSet } from '../analysis/engine'
import type { DetectionFinding, DetectionRule } from '../types'
import { createScanTicker, scanShouldStop, throwIfCancelled, type TaskHandle } from './progress'

/**
 * One streaming pass over the included files in time order (via the `timestamp` index).
 * Memory stays flat regardless of the number of rows: rules only keep a sliding window per group.
 */
export async function runDetectionRules(rules: DetectionRule[], task?: TaskHandle): Promise<DetectionFinding[]> {
  const files = await db.logFiles.toArray()
  const activeFileIds = new Set(files.filter((f) => f.active).map((f) => f.id!))
  const excludeInactive = activeFileIds.size < files.length
  const total = files.filter((f) => f.active).reduce((sum, f) => sum + f.eventCount, 0)

  const ruleSet = new RuleSet(rules)
  const tick = createScanTicker(total, task)
  await db.logs
    .orderBy('timestamp')
    .until(scanShouldStop(task))
    .each((log) => {
      tick()
      if (excludeInactive && !activeFileIds.has(log.fileId)) return
      ruleSet.feed(log)
    })
  throwIfCancelled(task)
  return ruleSet.findings
}
