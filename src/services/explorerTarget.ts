// ---------------------------------------------------------------------------
// "Open this in the Log Explorer": describes a view (search text / filter /
// time range) that another page wants the explorer to show, and hands it over
// through sessionStorage so nothing has to be squeezed into the URL.
// ---------------------------------------------------------------------------
import type { FilterCondition, FilterGroup, FilterOperator } from '../types'

export interface ExplorerTarget {
  search?: string
  filter?: FilterGroup
  /** Inclusive epoch-ms bounds; either side may be null (open-ended). */
  timeRange?: { start: number | null; end: number | null }
}

const KEY = 'log-analyzer:explorer-target'

/** Stats store values truncated to this length; longer ones must be matched by prefix. */
const STORED_VALUE_LIMIT = 512

type Cond = { field: string; operator: FilterOperator; value: string }

function condition(c: Cond): FilterCondition {
  return { id: crypto.randomUUID(), kind: 'condition', field: c.field, operator: c.operator, value: c.value }
}

export function conditionGroup(conds: Cond[], combinator: 'AND' | 'OR' = 'AND'): FilterGroup {
  return { id: crypto.randomUUID(), kind: 'group', combinator, rules: conds.map(condition) }
}

/** "equals", unless the value was long enough to have been truncated when counted. */
function exactOrPrefix(value: string): FilterOperator {
  return value.length >= STORED_VALUE_LIMIT ? 'starts_with' : 'equals'
}

export function fieldTarget(field: string, value: string): ExplorerTarget {
  return { filter: conditionGroup([{ field, operator: exactOrPrefix(value), value }]) }
}

export const ipTarget = (ip: string) => fieldTarget('srcIp', ip)
export const userAgentTarget = (ua: string) => fieldTarget('userAgent', ua)
export const statusTarget = (status: string) => fieldTarget('status', status)
export const usernameTarget = (name: string) => fieldTarget('username', name)
export const dstIpTarget = (ip: string) => fieldTarget('dstIp', ip)
export const eventTypeTarget = (type: string) => fieldTarget('eventType', type)

/** One or more URL paths. Paths are counted without their query string, so match the bare path or path + "?…". */
export function pathsTarget(paths: string[]): ExplorerTarget {
  const conds: Cond[] = []
  for (const path of paths) {
    if (path.length >= STORED_VALUE_LIMIT) {
      conds.push({ field: 'url', operator: 'starts_with', value: path })
    } else {
      conds.push({ field: 'url', operator: 'equals', value: path })
      conds.push({ field: 'url', operator: 'starts_with', value: `${path}?` })
    }
  }
  return { filter: conditionGroup(conds, 'OR') }
}

export const pathTarget = (path: string) => pathsTarget([path])

export function timeRangeTarget(startMs: number, endMs: number): ExplorerTarget {
  return { timeRange: { start: startMs, end: endMs } }
}

// ---- hand-over --------------------------------------------------------------

export function stashExplorerTarget(target: ExplorerTarget) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(target))
  } catch {
    /* private mode etc.: the explorer simply opens unfiltered */
  }
}

/** Reads without consuming, so React StrictMode's double-invoked initialisers see the same value. */
export function peekExplorerTarget(): ExplorerTarget | null {
  try {
    const raw = sessionStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as ExplorerTarget) : null
  } catch {
    return null
  }
}

export function clearExplorerTarget() {
  try {
    sessionStorage.removeItem(KEY)
  } catch {
    /* ignore */
  }
}

export function openInExplorer(navigate: (to: string) => void, target: ExplorerTarget) {
  stashExplorerTarget(target)
  navigate('/logs?applyTarget=1')
}
