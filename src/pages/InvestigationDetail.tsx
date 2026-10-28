import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { db } from '../db/database'
import type { Investigation, InvestigationStatus, LogEvent } from '../types'
import { formatTimestamp, formatNumber } from '../utils/format'
import { useTimezone } from '../hooks/useTimezone'
import { SeverityBadge } from '../components/ui/Badge'

const STATUSES: InvestigationStatus[] = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED', 'FALSE_POSITIVE']

export function InvestigationDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [inv, setInv] = useState<Investigation | null>(null)
  const [logs, setLogs] = useState<LogEvent[]>([])
  const { offsetMinutes } = useTimezone()

  const load = async () => {
    const investigation = await db.investigations.get(Number(id))
    setInv(investigation ?? null)
    const links = await db.investigationLogs.where('investigationId').equals(Number(id)).toArray()
    const logIds = links.map((l) => l.logId)
    const evs = logIds.length ? await db.logs.where('id').anyOf(logIds).toArray() : []
    evs.sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0))
    setLogs(evs)
  }

  useEffect(() => {
    load()
  }, [id])

  if (!inv) return <div className="p-6 text-sm text-[color:var(--color-text-faint)]">Loading…</div>

  const uniqueIps = new Set(logs.map((l) => l.srcIp).filter(Boolean)).size
  const uniqueUsers = new Set(logs.map((l) => l.username).filter(Boolean)).size
  const critCount = logs.filter((l) => l.severity === 'CRITICAL').length
  const susCount = logs.filter((l) => l.severity === 'HIGH').length

  const updateStatus = async (status: InvestigationStatus) => {
    await db.investigations.update(inv.id!, { status, updatedAt: Date.now() })
    load()
  }

  return (
    <div className="p-6 space-y-5">
      <button onClick={() => navigate('/investigations')} className="flex items-center gap-1.5 text-xs text-[color:var(--color-text-muted)] hover:text-[color:var(--color-text)]">
        <ArrowLeft size={14} /> Back to Investigations
      </button>

      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-mono-tabular text-[color:var(--color-text-faint)]">{inv.code}</p>
          <h1 className="text-lg font-bold">{inv.title}</h1>
          {inv.description && <p className="text-sm text-[color:var(--color-text-muted)] mt-1 max-w-xl">{inv.description}</p>}
        </div>
        <select
          value={inv.status}
          onChange={(e) => updateStatus(e.target.value as InvestigationStatus)}
          className="rounded-md border border-[color:var(--color-border-strong)] bg-[color:var(--color-surface)] px-2.5 py-1.5 text-xs font-medium"
        >
          {STATUSES.map((s) => (
            <option key={s} value={s}>{s.replace('_', ' ')}</option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Stat label="Total Events" value={logs.length} />
        <Stat label="Unique IP" value={uniqueIps} />
        <Stat label="Unique Users" value={uniqueUsers} />
        <Stat label="Critical Events" value={critCount} color="var(--color-critical)" />
        <Stat label="Suspicious Events" value={susCount} color="var(--color-high)" />
      </div>

      <div className="rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-bg-raised)] p-4">
        <h2 className="text-sm font-semibold mb-3 text-[color:var(--color-text-muted)]">Timeline</h2>
        {logs.length === 0 ? (
          <p className="text-xs text-[color:var(--color-text-faint)]">No events added to this investigation yet. Use "Add to Investigation" from the log detail drawer or bulk actions.</p>
        ) : (
          <ol className="relative border-l border-[color:var(--color-border-strong)] ml-2 space-y-4">
            {logs.map((log) => (
              <li key={log.id} className="ml-4">
                <span className="absolute -left-[5px] mt-1.5 h-2.5 w-2.5 rounded-full bg-[color:var(--color-accent)]" />
                <p className="text-xs font-mono-tabular text-[color:var(--color-text-faint)]">{formatTimestamp(log.timestamp, offsetMinutes)}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-sm font-medium">{log.eventType}</span>
                  <SeverityBadge severity={log.severity} />
                </div>
                <p className="text-xs text-[color:var(--color-text-muted)] font-mono-tabular">{log.srcIp}</p>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  )
}

function Stat({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div className="rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-bg-raised)] p-3">
      <p className="text-[10px] text-[color:var(--color-text-muted)] mb-1">{label}</p>
      <p className="text-lg font-bold font-mono-tabular" style={color ? { color } : undefined}>{formatNumber(value)}</p>
    </div>
  )
}
