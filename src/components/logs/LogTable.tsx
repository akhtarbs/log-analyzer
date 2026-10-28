import { useRef } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import type { LogEvent, Tag } from '../../types'
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
const ROW_HEIGHT = 34

function renderCell(col: ColumnDef, log: LogEvent, offsetMinutes: number, tags?: Tag[]) {
  switch (col.key) {
    case 'timestamp':
      return <span className="font-mono-tabular text-[color:var(--color-text-muted)]">{formatTimestamp(log.timestamp, offsetMinutes)}</span>
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
              style={{ backgroundColor: `${t.color}22`, color: t.color }}
            >
              {t.name}
            </span>
          ))}
        </span>
      ) : (
        <span className="text-[color:var(--color-text-faint)]">—</span>
      )
    case 'eventType':
      return <span className="truncate font-medium block">{log.eventType ?? '—'}</span>
    case 'rawLog':
      return <span className="truncate block font-mono-tabular text-[color:var(--color-text-muted)]">{log.rawLog}</span>
    case 'message':
    case 'url':
    case 'userAgent':
    case 'referer':
    case 'requestBody':
      return <span className="truncate block text-[color:var(--color-text-muted)]">{(log as any)[col.key] ?? '—'}</span>
    case 'srcPort':
    case 'dstPort':
      return <span className="font-mono-tabular text-[color:var(--color-text-muted)]">{(log as any)[col.key] ?? '—'}</span>
    case 'srcIp':
    case 'dstIp':
      return <span className="font-mono-tabular truncate block">{(log as any)[col.key] ?? '—'}</span>
    default:
      return <span className="truncate block text-[color:var(--color-text-muted)]">{(log as any)[col.key] ?? '—'}</span>
  }
}

export function LogTable({ rows, selected, visibleColumns, tagsByLogId, onToggleSelect, onToggleSelectAll, onRowClick }: LogTableProps) {
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
    <div className="flex flex-col h-full border border-[color:var(--color-border)] rounded-lg overflow-hidden bg-[color:var(--color-bg-raised)]">
      <div className="overflow-x-auto">
        <div style={{ minWidth: totalWidth }}>
          {/* header */}
          <div className="flex border-b border-[color:var(--color-border)] bg-[color:var(--color-surface)] sticky top-0 z-10 text-[11px] font-semibold uppercase tracking-wide text-[color:var(--color-text-muted)]">
            <div style={{ width: SELECT_COL_WIDTH }} className="px-2.5 py-2 shrink-0 flex items-center">
              <input type="checkbox" checked={allSelected} onChange={onToggleSelectAll} className="accent-[color:var(--color-accent)]" />
            </div>
            {columns.map((col) => (
              <div key={col.key} style={{ width: col.width }} className="px-2.5 py-2 shrink-0 flex items-center truncate">
                {col.key === 'timestamp' ? `${col.label} (${label})` : col.label}
              </div>
            ))}
          </div>

          <div ref={parentRef} className="overflow-y-auto" style={{ height: 'calc(100vh - 260px)' }}>
            <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
              {virtualizer.getVirtualItems().map((vRow) => {
                const log = rows[vRow.index]
                const isSelected = selected.has(log.id!)
                return (
                  <div
                    key={log.id}
                    className={cn(
                      'flex absolute top-0 left-0 w-full items-center text-xs border-b border-[color:var(--color-border)]/60 cursor-pointer hover:bg-[color:var(--color-surface-hover)]',
                      isSelected && 'bg-[color:var(--color-accent)]/8',
                    )}
                    style={{ height: ROW_HEIGHT, transform: `translateY(${vRow.start}px)` }}
                    onClick={() => onRowClick(log)}
                  >
                    <div style={{ width: SELECT_COL_WIDTH }} className="px-2.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => onToggleSelect(log.id!)}
                        className="accent-[color:var(--color-accent)]"
                      />
                    </div>
                    {columns.map((col) => (
                      <div key={col.key} style={{ width: col.width }} className="px-2.5 shrink-0 min-w-0" title={col.wide ? String((log as any)[col.key] ?? '') : undefined}>
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
