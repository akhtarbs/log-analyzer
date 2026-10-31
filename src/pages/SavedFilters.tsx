import { useNavigate } from 'react-router-dom'
import { Bookmark, Trash2, Play, Filter } from 'lucide-react'
import { useLiveQuery } from '../hooks/useLiveQuery'
import { db } from '../db/database'
import type { SavedFilter } from '../types'
import { Button } from '../components/ui/Button'
import { PageHeader } from '../components/ui/PageHeader'
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
    <div className="mx-auto max-w-[1500px] space-y-5 p-4 sm:p-6">
      <PageHeader
        eyebrow="Query Library"
        title="Saved Filters"
        description="Reusable queries you can re-apply to the log explorer in one click."
        icon={Bookmark}
        actions={<span className="chip chip-active">{filters.length} saved</span>}
      />

      {filters.length === 0 ? (
        <div className="hero-panel flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
          <span className="logo-mark !h-12 !w-12 !rounded-2xl">
            <Filter size={22} />
          </span>
          <div>
            <p className="display text-base font-semibold">No saved filters yet</p>
            <p className="mt-1 max-w-sm text-[13px] leading-relaxed text-[color:var(--color-text-muted)]">
              Build a filter in Log Explorer and click "Save Filter" to keep it here.
            </p>
          </div>
          <Button variant="primary" size="sm" onClick={() => navigate('/logs')}>
            <Play size={13} /> Open Log Explorer
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {filters.map((f) => (
            <div key={f.id} className="panel panel-hover flex flex-wrap items-center justify-between gap-4 p-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="icon-tile !h-7 !w-7 !rounded-lg">
                    <Filter size={13} />
                  </span>
                  <p className="display text-sm font-semibold">{f.name}</p>
                </div>
                <p className="mt-1.5 truncate font-mono-tabular text-[11px] text-[color:var(--color-text-faint)]">
                  {describeGroup(normalizeFilterGroup(f.group))}
                </p>
                <p className="mt-1 text-[10px] text-[color:var(--color-text-faint)]">{formatTimestamp(f.createdAt, offsetMinutes)}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Button variant="secondary" size="sm" onClick={() => applyFilter(f)}>
                  <Play size={13} /> Apply
                </Button>
                <button
                  onClick={() => deleteFilter(f.id!)}
                  aria-label={`Delete filter ${f.name}`}
                  className="rounded-lg p-1.5 text-[color:var(--color-text-faint)] transition-colors hover:bg-[color:var(--color-critical)]/12 hover:text-[color:var(--color-critical)]"
                >
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
