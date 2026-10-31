import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, ScanSearch, X, ChevronRight } from 'lucide-react'
import { useLiveQuery } from '../hooks/useLiveQuery'
import { db } from '../db/database'
import type { Investigation, InvestigationStatus, Priority } from '../types'
import { Button } from '../components/ui/Button'
import { PageHeader } from '../components/ui/PageHeader'
import { formatTimestamp } from '../utils/format'
import { useTimezone } from '../hooks/useTimezone'

const STATUS_COLOR: Record<InvestigationStatus, string> = {
  OPEN: 'var(--color-low)',
  IN_PROGRESS: 'var(--color-medium)',
  RESOLVED: 'var(--color-benign)',
  CLOSED: 'var(--color-text-faint)',
  FALSE_POSITIVE: 'var(--color-text-muted)',
}

const PRIORITY_COLOR: Record<Priority, string> = {
  CRITICAL: 'var(--color-critical)',
  HIGH: 'var(--color-high)',
  MEDIUM: 'var(--color-medium)',
  LOW: 'var(--color-low)',
}

export function Investigations() {
  const navigate = useNavigate()
  const investigations = useLiveQuery(() => db.investigations.orderBy('createdAt').reverse().toArray(), [], [] as Investigation[])
  const [showCreate, setShowCreate] = useState(false)
  const { offsetMinutes } = useTimezone()

  const openCount = investigations.filter((i) => i.status === 'OPEN' || i.status === 'IN_PROGRESS').length

  return (
    <div className="mx-auto max-w-[1500px] space-y-5 p-4 sm:p-6">
      <PageHeader
        eyebrow="Case Management"
        title="Investigations"
        description="Track suspicious activity from first signal to resolution. Each case holds its own evidence timeline."
        icon={ScanSearch}
        actions={
          <Button variant="primary" size="sm" onClick={() => setShowCreate(true)}>
            <Plus size={14} /> New Case
          </Button>
        }
      />

      <div className="flex flex-wrap gap-2">
        <span className="chip chip-active">{investigations.length} cases</span>
        <span className="chip">{openCount} active</span>
        <span className="chip">{investigations.length - openCount} closed</span>
      </div>

      {investigations.length === 0 ? (
        <div className="hero-panel flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
          <span className="logo-mark !h-12 !w-12 !rounded-2xl">
            <ScanSearch size={22} />
          </span>
          <div>
            <p className="display text-base font-semibold">No investigations yet</p>
            <p className="mt-1 max-w-sm text-[13px] leading-relaxed text-[color:var(--color-text-muted)]">
              Create a case to start tracking a threat, collecting evidence, and recording findings.
            </p>
          </div>
          <Button variant="primary" size="sm" onClick={() => setShowCreate(true)}>
            <Plus size={14} /> Create your first case
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {investigations.map((inv) => (
            <button
              key={inv.id}
              onClick={() => navigate(`/investigations/${inv.id}`)}
              className="panel panel-hover group relative overflow-hidden p-4 text-left"
            >
              <span
                aria-hidden
                className="absolute inset-x-0 top-0 h-[2px]"
                style={{ background: `linear-gradient(90deg, ${PRIORITY_COLOR[inv.priority]}, transparent 85%)` }}
              />
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="font-mono-tabular text-[10px] uppercase tracking-[0.1em] text-[color:var(--color-text-faint)]">{inv.code}</span>
                <ChevronRight
                  size={15}
                  className="text-[color:var(--color-text-faint)] transition-transform group-hover:translate-x-0.5 group-hover:text-[color:var(--color-accent-strong)]"
                />
              </div>
              <p className="display mb-3 text-sm font-semibold leading-snug">{inv.title}</p>
              <div className="mb-3 flex flex-wrap items-center gap-1.5">
                <span
                  className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide"
                  style={{
                    color: PRIORITY_COLOR[inv.priority],
                    background: `color-mix(in oklab, ${PRIORITY_COLOR[inv.priority]} 13%, transparent)`,
                    boxShadow: `inset 0 0 0 1px color-mix(in oklab, ${PRIORITY_COLOR[inv.priority]} 35%, transparent)`,
                  }}
                >
                  {inv.priority}
                </span>
                <span
                  className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                  style={{ color: STATUS_COLOR[inv.status] }}
                >
                  <span
                    aria-hidden
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ backgroundColor: STATUS_COLOR[inv.status], boxShadow: `0 0 7px 0 ${STATUS_COLOR[inv.status]}` }}
                  />
                  {inv.status.replace(/_/g, ' ')}
                </span>
              </div>
              <p className="font-mono-tabular text-[10px] text-[color:var(--color-text-faint)]">
                Opened {formatTimestamp(inv.createdAt, offsetMinutes)}
              </p>
            </button>
          ))}
        </div>
      )}

      {showCreate && <CreateInvestigationDialog onClose={() => setShowCreate(false)} />}
    </div>
  )
}

function CreateInvestigationDialog({ onClose }: { onClose: () => void }) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState<Priority>('MEDIUM')
  const navigate = useNavigate()

  const handleCreate = async () => {
    if (!title.trim()) return
    const count = await db.investigations.count()
    const code = `INV-${new Date().getFullYear()}-${String(count + 1).padStart(3, '0')}`
    const id = await db.investigations.add({
      code,
      title: title.trim(),
      description: description.trim(),
      priority,
      status: 'OPEN',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })
    onClose()
    navigate(`/investigations/${id}`)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#04060d]/70 p-4 backdrop-blur-sm">
      <div className="panel rise-in w-full max-w-md overflow-hidden">
        <div className="flex items-start justify-between gap-4 border-b border-[color:var(--color-border)]/70 px-5 py-4">
          <div>
            <div className="mb-1 flex items-center gap-2">
              <span className="eyebrow">New Case</span>
              <span className="accent-rule w-6 opacity-70" />
            </div>
            <h2 className="display text-base font-bold">Open an investigation</h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Close dialog"
            className="rounded-lg p-1.5 text-[color:var(--color-text-muted)] transition-colors hover:bg-[color:var(--color-surface-hover)] hover:text-[color:var(--color-text)]"
          >
            <X size={16} />
          </button>
        </div>
        <div className="space-y-3 p-5">
          <div>
            <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.12em] text-[color:var(--color-text-faint)]">Title</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Suspected SSH Brute Force"
              className="w-full rounded-lg border border-[color:var(--color-border-strong)] bg-[color:var(--color-surface)] px-3 py-2 text-sm transition-colors focus:border-[color:var(--color-accent)]/60 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.12em] text-[color:var(--color-text-faint)]">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What triggered this investigation?"
              rows={3}
              className="w-full resize-none rounded-lg border border-[color:var(--color-border-strong)] bg-[color:var(--color-surface)] px-3 py-2 text-sm transition-colors focus:border-[color:var(--color-accent)]/60 focus:outline-none"
            />
          </div>
          <div>
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[color:var(--color-text-faint)]">Priority</p>
            <div className="flex flex-wrap gap-1.5">
              {(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as Priority[]).map((p) => {
                const active = priority === p
                return (
                  <button
                    key={p}
                    onClick={() => setPriority(p)}
                    className={`rounded-lg border px-2.5 py-1 text-xs font-semibold transition-all ${
                      active ? '' : 'border-[color:var(--color-border-strong)] text-[color:var(--color-text-muted)] hover:bg-[color:var(--color-surface-hover)]'
                    }`}
                    style={
                      active
                        ? {
                            color: PRIORITY_COLOR[p],
                            borderColor: `color-mix(in oklab, ${PRIORITY_COLOR[p]} 55%, transparent)`,
                            background: `color-mix(in oklab, ${PRIORITY_COLOR[p]} 14%, transparent)`,
                          }
                        : undefined
                    }
                  >
                    {p}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-[color:var(--color-border)]/70 px-5 py-3.5">
          <Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
          <Button variant="primary" size="sm" onClick={handleCreate}>Create</Button>
        </div>
      </div>
    </div>
  )
}
