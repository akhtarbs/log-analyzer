import { useRef } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import type { LogEvent, Severity, Tag } from '../../types'
import { SeverityBadge, MarkBadge } from '../ui/Badge'
import { formatTimestamp } from '../../utils/format'
import { useTimezone } from '../../hooks/useTimezone'
import { cn } from '../../utils/cn'
import { ALL_COLUMNS, type ColumnDef } from './columns'

interface LogTableProps {
  rows: LogEvent[]
  selected: Set<number>
  visibleColumns: string[]
  tagsByLogId?: Map<number, Tag[]>
  onToggleSelect: (id: number) => void
  onToggleSelectAll: () => void
  onRowClick: (log: LogEvent) => void
}

const SELECT_COL_WIDTH = 36
const ROW_HEIGHT = 36

const SEVERITY_RAIL: Record<Severity, string> = {
  CRITICAL: 'var(--color-critical)',
  HIGH: 'var(--color-high)',
  MEDIUM: 'var(--color-medium)',
  LOW: 'var(--color-low)',
  INFO: 'var(--color-info)',
}

function renderCell(col: ColumnDef, log: LogEvent, offsetMinutes: number, tags?: Tag[]) {
  switch (col.key) {
    case 'timestamp':
      return (
        <span className="font-mono-tabular text-[color:var(--color-text-muted)]">
          {formatTimestamp(log.timestamp, offsetMinutes)}
        </span>
      )
    case 'severity':
      return <SeverityBadge severity={log.severity} />
    case 'mark':
      return <MarkBadge mark={log.mark} />
    case 'tags':
      return tags && tags.length > 0 ? (
        <span className="flex flex-wrap gap-1">
          {tags.map((t) => (
            <span
              key={t.id}
              className="rounded-full px-1.5 py-0.5 text-[10px] font-medium leading-none"
              style={{
                backgroundColor: `color-mix(in oklab, ${t.color} 16%, transparent)`,
                color: t.color,
                boxShadow: `inset 0 0 0 1px color-mix(in oklab, ${t.color} 30%, transparent)`,
              }}
            >
              {t.name}
            </span>
          ))}
        </span>
      ) : (
        <span className="text-[color:var(--color-text-faint)]">—</span>
      )
    case 'eventType':
      return log.eventType ? (
        <span className="event-pill">
          <span className="truncate">{log.eventType}</span>
        </span>
      ) : (
        <span className="text-[color:var(--color-text-faint)]">—</span>
      )
    case 'rawLog':
      return <span className="block truncate font-mono-tabular text-[color:var(--color-text-muted)]">{log.rawLog}</span>
    case 'message':
    case 'url':
    case 'userAgent':
    case 'referer':
    case 'requestBody':
      return <span className="block truncate text-[color:var(--color-text-muted)]">{(log as any)[col.key] ?? '—'}</span>
    case 'srcPort':
    case 'dstPort':
      return <span className="font-mono-tabular text-[color:var(--color-text-muted)]">{(log as any)[col.key] ?? '—'}</span>
    case 'srcIp':
    case 'dstIp':
      return <span className="block truncate font-mono-tabular">{(log as any)[col.key] ?? '—'}</span>
    default:
      return <span className="block truncate text-[color:var(--color-text-muted)]">{(log as any)[col.key] ?? '—'}</span>
  }
}

export function LogTable({
  rows,
  selected,
  visibleColumns,
  tagsByLogId,
  onToggleSelect,
  onToggleSelectAll,
  onRowClick,
}: LogTableProps) {
  const parentRef = useRef<HTMLDivElement>(null)
  const { offsetMinutes, label } = useTimezone()

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 15,
  })

  const columns = ALL_COLUMNS.filter((c) => visibleColumns.includes(c.key))
  const totalWidth = SELECT_COL_WIDTH + columns.reduce((s, c) => s + c.width, 0)
  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id!))

  return (
    <div className="table-shell flex h-full flex-col">
      <div className="overflow-x-auto">
        <div style={{ minWidth: totalWidth }}>
          {/* header */}
          <div className="log-head sticky top-0 z-10 flex text-[10px] font-bold uppercase tracking-[0.12em] text-[color:var(--color-text-muted)]">
            <div style={{ width: SELECT_COL_WIDTH }} className="flex shrink-0 items-center px-2.5 py-2.5">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={onToggleSelectAll}
                className="accent-[color:var(--color-accent)]"
                aria-label="Select all rows"
              />
            </div>
            {columns.map((col) => (
              <div key={col.key} style={{ width: col.width }} className="flex shrink-0 items-center truncate px-2.5 py-2.5">
                {col.key === 'timestamp' ? `${col.label} (${label})` : col.label}
              </div>
            ))}
          </div>

          <div ref={parentRef} className="overflow-y-auto" style={{ height: 'calc(100vh - 268px)' }}>
            <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
              {virtualizer.getVirtualItems().map((vRow) => {
                const log = rows[vRow.index]
                const isSelected = selected.has(log.id!)
                return (
                  <div
                    key={log.id}
                    className={cn('log-row flex absolute left-0 top-0 w-full cursor-pointer items-center text-xs', {
                      'log-row-alt': vRow.index % 2 === 1,
                      'log-row-selected': isSelected,
                    })}
                    style={{ height: ROW_HEIGHT, transform: `translateY(${vRow.start}px)` }}
                    onClick={() => onRowClick(log)}
                  >
                    <span
                      className="log-rail"
                      style={{ backgroundColor: SEVERITY_RAIL[log.severity], color: SEVERITY_RAIL[log.severity] }}
                      aria-hidden
                    />
                    <div style={{ width: SELECT_COL_WIDTH }} className="shrink-0 px-2.5" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => onToggleSelect(log.id!)}
                        className="accent-[color:var(--color-accent)]"
                        aria-label="Select row"
                      />
                    </div>
                    {columns.map((col) => (
                      <div
                        key={col.key}
                        style={{ width: col.width }}
                        className="min-w-0 shrink-0 px-2.5"
                        title={col.wide ? String((log as any)[col.key] ?? '') : undefined}
                      >
                        {renderCell(col, log, offsetMinutes, tagsByLogId?.get(log.id!))}
                      </div>
                    ))}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
