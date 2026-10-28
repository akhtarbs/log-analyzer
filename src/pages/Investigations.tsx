import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, ScanSearch, X } from 'lucide-react'
import { useLiveQuery } from '../hooks/useLiveQuery'
import { db } from '../db/database'
import type { Investigation, InvestigationStatus, Priority } from '../types'
import { Button } from '../components/ui/Button'
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

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold flex items-center gap-2">
          <ScanSearch size={18} className="text-[color:var(--color-accent)]" /> Investigations
        </h1>
        <Button variant="primary" size="sm" onClick={() => setShowCreate(true)}>
          <Plus size={14} /> New Case
        </Button>
      </div>

      {investigations.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[color:var(--color-border-strong)] p-10 text-center text-sm text-[color:var(--color-text-faint)]">
          No investigations yet. Create a case to start tracking a threat.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {investigations.map((inv) => (
            <button
              key={inv.id}
              onClick={() => navigate(`/investigations/${inv.id}`)}
              className="text-left rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-bg-raised)] p-4 hover:border-[color:var(--color-accent)]/50 transition-colors"
            >
              <p className="text-xs font-mono-tabular text-[color:var(--color-text-faint)] mb-1">{inv.code}</p>
              <p className="text-sm font-semibold mb-2">{inv.title}</p>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded border" style={{ color: PRIORITY_COLOR[inv.priority], borderColor: `${PRIORITY_COLOR[inv.priority]}55` }}>
                  {inv.priority}
                </span>
                <span className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded" style={{ color: STATUS_COLOR[inv.status] }}>
                  {inv.status.replace('_', ' ')}
                </span>
              </div>
              <p className="text-[10px] text-[color:var(--color-text-faint)] font-mono-tabular">{formatTimestamp(inv.createdAt, offsetMinutes)}</p>
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-bg-raised)] shadow-2xl">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-[color:var(--color-border)]">
          <h2 className="text-sm font-semibold">New Investigation</h2>
          <button onClick={onClose} className="text-[color:var(--color-text-muted)] hover:text-[color:var(--color-text)]"><X size={16} /></button>
        </div>
        <div className="p-5 space-y-3">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Title, e.g. Suspected SSH Brute Force"
            className="w-full rounded-md border border-[color:var(--color-border-strong)] bg-[color:var(--color-surface)] px-3 py-2 text-sm"
          />
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Description…"
            rows={3}
            className="w-full rounded-md border border-[color:var(--color-border-strong)] bg-[color:var(--color-surface)] px-3 py-2 text-sm resize-none"
          />
          <div>
            <p className="text-xs text-[color:var(--color-text-muted)] mb-1.5">Priority</p>
            <div className="flex gap-1.5">
              {(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as Priority[]).map((p) => (
                <button
                  key={p}
                  onClick={() => setPriority(p)}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium border ${priority === p ? 'border-[color:var(--color-accent)] bg-[color:var(--color-accent)]/12 text-[color:var(--color-accent-strong)]' : 'border-[color:var(--color-border-strong)] text-[color:var(--color-text-muted)]'}`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 px-5 py-3.5 border-t border-[color:var(--color-border)]">
          <Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
          <Button variant="primary" size="sm" onClick={handleCreate}>Create</Button>
        </div>
      </div>
    </div>
  )
}
