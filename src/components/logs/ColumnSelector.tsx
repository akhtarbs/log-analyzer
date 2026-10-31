import { useState, useRef, useEffect } from 'react'
import { Columns3, RotateCcw } from 'lucide-react'
import { ALL_COLUMNS, DEFAULT_VISIBLE_COLUMNS } from './columns'
import { Button } from '../ui/Button'

export function ColumnSelector({
  visible,
  onChange,
}: {
  visible: string[]
  onChange: (keys: string[]) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const toggle = (key: string) => {
    if (key === 'timestamp') return // mandatory
    if (visible.includes(key)) {
      onChange(visible.filter((k) => k !== key))
    } else {
      // keep the ALL_COLUMNS order regardless of toggle order
      onChange(ALL_COLUMNS.map((c) => c.key).filter((k) => visible.includes(k) || k === key))
    }
  }

  return (
    <div className="relative" ref={ref}>
      <Button variant="secondary" size="sm" onClick={() => setOpen((v) => !v)}>
        <Columns3 size={14} /> Columns ({visible.length})
      </Button>

      {open && (
        <div className="panel rise-in absolute right-0 z-30 mt-2 max-h-96 w-64 overflow-y-auto p-1.5">
          <div className="mb-1 flex items-center justify-between border-b border-[color:var(--color-border)]/70 px-2 pb-2 pt-1">
            <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[color:var(--color-text-faint)]">Visible columns</span>
            <button
              onClick={() => onChange(DEFAULT_VISIBLE_COLUMNS)}
              className="flex items-center gap-1 text-[10px] text-[color:var(--color-text-muted)] transition-colors hover:text-[color:var(--color-accent-strong)]"
              title="Reset to default columns"
            >
              <RotateCcw size={11} /> Reset
            </button>
          </div>
          {ALL_COLUMNS.map((col) => {
            const checked = visible.includes(col.key)
            return (
              <label
                key={col.key}
                className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs transition-colors hover:bg-[color:var(--color-surface-hover)] ${
                  col.mandatory ? 'cursor-not-allowed opacity-70' : 'cursor-pointer'
                }`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={col.mandatory}
                  onChange={() => toggle(col.key)}
                  className="accent-[color:var(--color-accent)]"
                />
                <span>{col.label}</span>
                {col.mandatory && <span className="ml-auto text-[9px] uppercase tracking-wide text-[color:var(--color-text-faint)]">required</span>}
              </label>
            )
          })}
        </div>
      )}
    </div>
  )
}
