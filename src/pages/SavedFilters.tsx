import { useNavigate } from 'react-router-dom'
import { Bookmark, Trash2, Play } from 'lucide-react'
import { useLiveQuery } from '../hooks/useLiveQuery'
import { db } from '../db/database'
import type { SavedFilter } from '../types'
import { Button } from '../components/ui/Button'
import { formatTimestamp } from '../utils/format'
import { useTimezone } from '../hooks/useTimezone'
import { describeGroup, normalizeFilterGroup } from '../services/filterEngine'

export function SavedFilters() {
  const { offsetMinutes } = useTimezone()
  const filters = useLiveQuery(() => db.savedFilters.orderBy('createdAt').reverse().toArray(), [], [] as SavedFilter[])
  const navigate = useNavigate()

  const applyFilter = (f: SavedFilter) => {
    sessionStorage.setItem('log-analyzer:pending-filter', JSON.stringify(normalizeFilterGroup(f.group)))
    navigate('/logs?applyFilter=1')
  }

  const deleteFilter = async (id: number) => {
    await db.savedFilters.delete(id)
  }

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-lg font-bold flex items-center gap-2">
        <Bookmark size={18} className="text-[color:var(--color-accent)]" /> Saved Filters
      </h1>

      {filters.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[color:var(--color-border-strong)] p-10 text-center text-sm text-[color:var(--color-text-faint)]">
          No saved filters yet. Build a filter in Log Explorer and click "Save Filter".
        </div>
      ) : (
        <div className="space-y-2">
          {filters.map((f) => (
            <div key={f.id} className="flex items-center justify-between rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg-raised)] p-3.5">
              <div>
                <p className="text-sm font-semibold">{f.name}</p>
                <p className="text-[11px] text-[color:var(--color-text-faint)] font-mono-tabular mt-0.5">
                  {describeGroup(normalizeFilterGroup(f.group))}
                </p>
                <p className="text-[10px] text-[color:var(--color-text-faint)] mt-1">{formatTimestamp(f.createdAt, offsetMinutes)}</p>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="secondary" size="sm" onClick={() => applyFilter(f)}>
                  <Play size={13} /> Apply
                </Button>
                <button onClick={() => deleteFilter(f.id!)} className="text-[color:var(--color-text-faint)] hover:text-[color:var(--color-critical)]">
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
