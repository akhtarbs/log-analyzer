import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Search, SlidersHorizontal, Download, Upload, Save, Files, ArrowDown, ArrowUp, ListTree } from 'lucide-react'
import { useLiveQuery } from '../hooks/useLiveQuery'
import { db } from '../db/database'
import { queryLogs, getTagsForLogs } from '../services/logService'
import { hasExcludedFiles } from '../services/fileService'
import { clearExplorerTarget, peekExplorerTarget } from '../services/explorerTarget'
import { isCancelled, startTask, type TaskHandle } from '../services/progress'
import { exportCsv, exportJson, exportTxt } from '../services/exportService'
import type { FilterGroup, LogEvent, Tag } from '../types'
import { LogTable } from '../components/logs/LogTable'
import { ImportDialog } from '../components/logs/ImportDialog'
import { LogFilesPanel } from '../components/logs/LogFilesPanel'
import { TimeRangeFilter, EMPTY_TIME_RANGE, type TimeRange } from '../components/logs/TimeRangeFilter'
import { ColumnSelector } from '../components/logs/ColumnSelector'
import { loadVisibleColumns, saveVisibleColumns } from '../components/logs/columns'
import { loadExplorerView, saveExplorerView, PAGE_SIZE_OPTIONS } from '../components/logs/viewState'
import { FilterBuilder, emptyFilterGroup, newCondition } from '../components/filters/FilterBuilder'
import { countConditions, normalizeFilterGroup } from '../services/filterEngine'
import { LogDetailDrawer } from '../components/logs/LogDetailDrawer'
import { BulkActionToolbar } from '../components/logs/BulkActionToolbar'
import { Button } from '../components/ui/Button'
import { PageHeader } from '../components/ui/PageHeader'

const QUICK_FILTERS: { key: any; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'CRITICAL', label: 'Critical' },
  { key: 'HIGH', label: 'High' },
  { key: 'MEDIUM', label: 'Medium' },
  { key: 'LOW', label: 'Low' },
  { key: 'marked', label: 'Marked' },
  { key: 'unmarked', label: 'Unmarked' },
  { key: 'suspicious', label: 'Suspicious' },
]

const DEFAULT_PAGE_SIZE = 100

export function LogExplorer() {
  const [params, setParams] = useSearchParams()
  // Restore the previous working position, unless we arrived with an explicit target (a link that
  // carries its own search or filter, e.g. from the Dashboard or Saved Filters).
  // A view handed over by another page (Analysis findings, indicators, timeline bars). It is only peeked
  // here and cleared in an effect, so React StrictMode's double-invoked initialisers see the same value.
  const [target] = useState(() => (params.get('applyTarget') === '1' ? peekExplorerTarget() : null))
  const [saved] = useState(() => {
    const explicit = Boolean(params.get('search')) || params.get('applyFilter') === '1' || Boolean(target)
    const v = loadExplorerView()
    return explicit ? { sortDir: v.sortDir, pageSize: v.pageSize } : v
  })
  const [search, setSearch] = useState(target?.search ?? params.get('search') ?? saved.search ?? '')
  const [debouncedSearch, setDebouncedSearch] = useState(search)
  const [quickFilter, setQuickFilter] = useState<any>(saved.quickFilter ?? 'all')
  const [showFilterBuilder, setShowFilterBuilder] = useState(false)
  const [filterGroup, setFilterGroup] = useState<FilterGroup>(target?.filter ?? saved.filterGroup ?? emptyFilterGroup())
  const [appliedFilterGroup, setAppliedFilterGroup] = useState<FilterGroup>(target?.filter ?? saved.filterGroup ?? emptyFilterGroup())
  const [page, setPage] = useState(saved.page ?? 0)
  const [pageInput, setPageInput] = useState(String((saved.page ?? 0) + 1))
  const [pageSize, setPageSize] = useState(saved.pageSize ?? DEFAULT_PAGE_SIZE)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>(saved.sortDir ?? 'desc')
  const [timeRange, setTimeRange] = useState<TimeRange>(target?.timeRange ?? saved.timeRange ?? EMPTY_TIME_RANGE)
  const [rows, setRows] = useState<LogEvent[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [detailLog, setDetailLog] = useState<LogEvent | null>(null)
  const [showImport, setShowImport] = useState(params.get('import') === '1')
  const [showFilesPanel, setShowFilesPanel] = useState(false)
  const [excludedNotice, setExcludedNotice] = useState(false)
  const [showSaveFilterName, setShowSaveFilterName] = useState(false)
  const [saveFilterName, setSaveFilterName] = useState('')
  const [visibleColumns, setVisibleColumns] = useState<string[]>(() => loadVisibleColumns())
  const [tagsByLogId, setTagsByLogId] = useState<Map<number, Tag[]>>(new Map())

  const handleColumnsChange = (keys: string[]) => {
    setVisibleColumns(keys)
    saveVisibleColumns(keys)
  }

  const fileCount = useLiveQuery(() => db.logFiles.count(), [], 0)

  // The handed-over target has been applied above; drop it so a refresh doesn't re-apply it.
  useEffect(() => {
    if (target) {
      clearExplorerTarget()
      setParams({}, { replace: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    hasExcludedFiles().then(setExcludedNotice)
  }, [fileCount])

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(t)
  }, [search])

  const queryTaskRef = useRef<TaskHandle | null>(null)

  const runQuery = useCallback(async () => {
    // Typing/filtering quickly can start several scans; cancel the previous one
    // so a slow, outdated scan can never overwrite newer results.
    queryTaskRef.current?.cancel()
    const task = startTask('Searching logs', { cancellable: true })
    queryTaskRef.current = task
    setLoading(true)
    try {
      const result = await queryLogs({
        search: debouncedSearch || undefined,
        quickFilter,
        filterGroup: appliedFilterGroup,
        timeRange,
        page,
        pageSize,
        sortField: 'timestamp',
        sortDir,
        task,
      })
      if (queryTaskRef.current !== task) return
      setRows(result.rows)
      setTotal(result.total)
      // Fetch tags only for the "Tags" column when it's actually visible, to
      // avoid an extra query on every page load for users who don't use it.
      if (visibleColumns.includes('tags')) {
        const ids = result.rows.map((r) => r.id!).filter(Boolean)
        getTagsForLogs(ids).then(setTagsByLogId)
      } else {
        setTagsByLogId(new Map())
      }
    } catch (e) {
      if (!isCancelled(e)) throw e
    } finally {
      task.finish()
      if (queryTaskRef.current === task) {
        queryTaskRef.current = null
        setLoading(false)
      }
    }
  }, [debouncedSearch, quickFilter, appliedFilterGroup, timeRange, page, pageSize, sortDir, visibleColumns])

  useEffect(() => {
    runQuery()
  }, [runQuery, fileCount])

  useEffect(() => () => queryTaskRef.current?.cancel(), [])

  // Go back to page 1 when the query changes — but not on the first render, so a restored page sticks.
  const queryKey = JSON.stringify([debouncedSearch, quickFilter, appliedFilterGroup, timeRange, pageSize, sortDir])
  const prevQueryKey = useRef<string | null>(null)
  useEffect(() => {
    if (prevQueryKey.current !== null && prevQueryKey.current !== queryKey) setPage(0)
    prevQueryKey.current = queryKey
  }, [queryKey])

  // If the data shrank (file deleted/excluded) a restored page can be past the end.
  useEffect(() => {
    if (!loading && page > 0 && page * pageSize >= total) setPage(Math.max(0, Math.ceil(total / pageSize) - 1))
  }, [loading, total, page, pageSize])

  useEffect(() => {
    saveExplorerView({ search: debouncedSearch, quickFilter, filterGroup: appliedFilterGroup, sortDir, pageSize, page, timeRange })
  }, [debouncedSearch, quickFilter, appliedFilterGroup, sortDir, pageSize, page, timeRange])

  useEffect(() => {
    setPageInput(String(page + 1))
  }, [page])

  useEffect(() => {
    if (debouncedSearch) setParams({ search: debouncedSearch }, { replace: true })
  }, [debouncedSearch])

  // Pick up a filter handed off from the Saved Filters page.
  useEffect(() => {
    if (params.get('applyFilter') === '1') {
      const pending = sessionStorage.getItem('log-analyzer:pending-filter')
      if (pending) {
        const group = normalizeFilterGroup(JSON.parse(pending))
        setFilterGroup(group)
        setAppliedFilterGroup(group)
        sessionStorage.removeItem('log-analyzer:pending-filter')
      }
      setParams({}, { replace: true })
    }
  }, [])

  const toggleSelect = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSelectAll = () => {
    setSelected((prev) => {
      const allSelected = rows.length > 0 && rows.every((r) => prev.has(r.id!))
      if (allSelected) return new Set()
      return new Set(rows.map((r) => r.id!))
    })
  }

  const handleOpenFilterBuilder = () => {
    if (filterGroup.rules.length === 0) {
      setFilterGroup({ ...filterGroup, rules: [newCondition()] })
    }
    setShowFilterBuilder(true)
  }

  const handleApplyFilter = () => {
    setAppliedFilterGroup(filterGroup)
    setShowFilterBuilder(false)
  }

  const handleSaveFilter = async () => {
    setShowSaveFilterName(true)
  }

  const confirmSaveFilter = async () => {
    if (!saveFilterName.trim()) return
    await db.savedFilters.add({ name: saveFilterName.trim(), group: filterGroup, createdAt: Date.now() })
    setShowSaveFilterName(false)
    setSaveFilterName('')
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  const goToPage = (input: string) => {
    const n = parseInt(input, 10)
    if (isNaN(n)) {
      setPageInput(String(page + 1))
      return
    }
    const clamped = Math.min(Math.max(n, 1), totalPages)
    setPage(clamped - 1)
    setPageInput(String(clamped))
  }

  const exportScope = useMemo(() => (selected.size > 0 ? rows.filter((r) => selected.has(r.id!)) : rows), [rows, selected])

  return (
    <div className="flex h-full flex-col gap-4 p-4 sm:p-5">
      <PageHeader
        eyebrow="Explore"
        title="Log Explorer"
        description="Search, filter and triage every event you have imported — without the data ever leaving this browser."
        icon={ListTree}
        actions={
          <>
            <Button variant="secondary" size="sm" onClick={() => setShowFilesPanel(true)}>
              <Files size={14} /> Log files {fileCount > 0 && `(${fileCount})`}
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setShowImport(true)}>
              <Upload size={14} /> Import log
            </Button>
            <ExportMenu scope={exportScope} hasSelection={selected.size > 0} />
          </>
        }
      />

      {excludedNotice && (
        <div className="flex items-center justify-between rounded-lg border border-[color:var(--color-medium)]/35 bg-[color:var(--color-medium)]/10 px-3.5 py-2.5 text-xs text-[color:var(--color-medium)]">
          <span>Some log files are excluded from analysis and hidden from results below.</span>
          <button onClick={() => setShowFilesPanel(true)} className="shrink-0 ml-3 underline">Manage files</button>
        </div>
      )}

      <div className="panel flex flex-wrap items-center gap-2.5 p-3">
        <div className="relative min-w-[200px] flex-1 md:max-w-sm">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[color:var(--color-text-faint)]" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search logs…"
            className="w-full rounded-lg border border-[color:var(--color-border-strong)] bg-[color:var(--color-bg)]/60 py-2 pl-9 pr-3 text-sm transition-colors focus:border-[color:var(--color-accent)]/70"
          />
        </div>
        <Button variant="secondary" size="sm" onClick={handleOpenFilterBuilder}>
          <SlidersHorizontal size={14} /> Filter
        </Button>
        {countConditions(appliedFilterGroup) > 0 && (
          <span className="chip chip-active">{countConditions(appliedFilterGroup)} active</span>
        )}
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'))}
          title="Toggle timestamp sort order"
        >
          {sortDir === 'desc' ? <ArrowDown size={14} /> : <ArrowUp size={14} />}
          {sortDir === 'desc' ? 'Newest first' : 'Oldest first'}
        </Button>
        <TimeRangeFilter value={timeRange} onChange={setTimeRange} />
        <div className="ml-auto">
          <ColumnSelector visible={visibleColumns} onChange={handleColumnsChange} />
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {QUICK_FILTERS.map((qf) => (
          <button
            key={qf.key}
            onClick={() => setQuickFilter(qf.key)}
            className={`chip ${quickFilter === qf.key ? 'chip-active' : ''}`}
          >
            {qf.label}
          </button>
        ))}
      </div>

      {showFilterBuilder && (
        <FilterBuilder
          group={filterGroup}
          onChange={setFilterGroup}
          onClose={() => setShowFilterBuilder(false)}
          onApply={handleApplyFilter}
          onSave={handleSaveFilter}
        />
      )}

      {showSaveFilterName && (
        <div className="panel flex items-center gap-2 p-3">
          <input
            value={saveFilterName}
            onChange={(e) => setSaveFilterName(e.target.value)}
            placeholder="Filter name"
            className="flex-1 rounded-lg border border-[color:var(--color-border-strong)] bg-[color:var(--color-bg)]/60 px-2.5 py-1.5 text-xs"
          />
          <Button variant="primary" size="sm" onClick={confirmSaveFilter}><Save size={14} /> Save</Button>
          <Button variant="ghost" size="sm" onClick={() => setShowSaveFilterName(false)}>Cancel</Button>
        </div>
      )}

      <div className="min-h-0 flex-1">
        {rows.length === 0 && loading ? (
          <div className="flex h-full items-center justify-center text-sm text-[color:var(--color-text-faint)]">
            Loading events…
          </div>
        ) : rows.length === 0 ? (
          <div className="panel-soft flex h-full items-center justify-center border-dashed text-sm text-[color:var(--color-text-faint)]">
            {total === 0 && fileCount === 0 ? 'No logs imported yet. Import a file to get started.' : 'No events match your search or filter.'}
          </div>
        ) : (
          <LogTable
            rows={rows}
            selected={selected}
            visibleColumns={visibleColumns}
            tagsByLogId={tagsByLogId}
            onToggleSelect={toggleSelect}
            onToggleSelectAll={toggleSelectAll}
            onRowClick={setDetailLog}
          />
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[color:var(--color-text-muted)]">
        <span className="font-mono-tabular">{total.toLocaleString()} events</span>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span>Rows:</span>
            <select
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
              className="rounded-lg border border-[color:var(--color-border-strong)] bg-[color:var(--color-surface)] px-2 py-1 text-xs font-mono-tabular"
            >
              {PAGE_SIZE_OPTIONS.map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Prev</Button>
            <div className="flex items-center gap-1">
              <span>Page</span>
              <input
                value={pageInput}
                onChange={(e) => setPageInput(e.target.value)}
                onBlur={(e) => goToPage(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    goToPage((e.target as HTMLInputElement).value)
                    ;(e.target as HTMLInputElement).blur()
                  }
                }}
                className="w-12 rounded-lg border border-[color:var(--color-border-strong)] bg-[color:var(--color-surface)] px-1.5 py-1 text-center text-xs font-mono-tabular"
              />
              <span>/ {totalPages}</span>
            </div>
            <Button variant="ghost" size="sm" disabled={page + 1 >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
          </div>
        </div>
      </div>

      {showImport && (
        <ImportDialog
          onClose={() => { setShowImport(false); setParams({}, { replace: true }) }}
          onImported={() => runQuery()}
        />
      )}

      {showFilesPanel && (
        <LogFilesPanel
          onClose={() => setShowFilesPanel(false)}
          onChanged={() => { runQuery(); hasExcludedFiles().then(setExcludedNotice) }}
        />
      )}

      {detailLog && <LogDetailDrawer log={detailLog} onClose={() => setDetailLog(null)} onChanged={() => runQuery()} />}

      {selected.size > 0 && (
        <BulkActionToolbar selectedIds={[...selected]} onClear={() => { setSelected(new Set()); runQuery() }} />
      )}
    </div>
  )
}

function ExportMenu({ scope, hasSelection }: { scope: LogEvent[]; hasSelection: boolean }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative">
      <Button variant="secondary" size="sm" onClick={() => setOpen((v) => !v)}>
        <Download size={14} /> Export {hasSelection ? `(${scope.length} selected)` : ''}
      </Button>
      {open && (
        <div className="panel absolute right-0 z-20 mt-1 w-44 overflow-hidden p-1">
          {[
            { label: 'Export CSV', fn: () => exportCsv(scope) },
            { label: 'Export JSON', fn: () => exportJson(scope) },
            { label: 'Export TXT', fn: () => exportTxt(scope) },
          ].map((opt) => (
            <button
              key={opt.label}
              onClick={() => { opt.fn(); setOpen(false) }}
              className="w-full rounded-md px-3 py-2 text-left text-xs text-[color:var(--color-text-muted)] transition-colors hover:bg-[color:var(--color-surface-hover)] hover:text-[color:var(--color-text)]"
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
