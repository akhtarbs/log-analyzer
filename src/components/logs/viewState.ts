import type { FilterGroup } from '../../types'
import { normalizeFilterGroup } from '../../services/filterEngine'
import type { TimeRange } from './TimeRangeFilter'

// The Log Explorer's working position (search, filters, sort, page size, page, time range)
// is remembered across refreshes, so reloading the app returns you where you were.
const KEY = 'log-analyzer:explorer-view-v1'

export const PAGE_SIZE_OPTIONS = [100, 200, 300, 500]
export const QUICK_FILTER_KEYS = ['all', 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'marked', 'unmarked', 'suspicious']

export interface ExplorerViewState {
  search: string
  quickFilter: string
  filterGroup: FilterGroup
  sortDir: 'asc' | 'desc'
  pageSize: number
  page: number
  timeRange: TimeRange
}

const numOrNull = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)

export function loadExplorerView(): Partial<ExplorerViewState> {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return {}
    const v = JSON.parse(raw) as Record<string, unknown>
    const out: Partial<ExplorerViewState> = {}
    if (typeof v.search === 'string') out.search = v.search
    if (typeof v.quickFilter === 'string' && QUICK_FILTER_KEYS.includes(v.quickFilter)) out.quickFilter = v.quickFilter
    if (v.filterGroup) out.filterGroup = normalizeFilterGroup(v.filterGroup)
    if (v.sortDir === 'asc' || v.sortDir === 'desc') out.sortDir = v.sortDir
    if (typeof v.pageSize === 'number' && PAGE_SIZE_OPTIONS.includes(v.pageSize)) out.pageSize = v.pageSize
    if (typeof v.page === 'number' && Number.isInteger(v.page) && v.page >= 0) out.page = v.page
    const tr = v.timeRange as { start?: unknown; end?: unknown } | undefined
    if (tr) out.timeRange = { start: numOrNull(tr.start), end: numOrNull(tr.end) }
    return out
  } catch {
    return {}
  }
}

export function saveExplorerView(state: ExplorerViewState) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state))
  } catch {
    /* storage full / unavailable — not worth interrupting the user */
  }
}
