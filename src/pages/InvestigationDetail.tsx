import { useEffect, useState } from 'react'
import type { ComponentType, CSSProperties } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Activity, Globe2, Users, ShieldAlert, Flame } from 'lucide-react'
import { db } from '../db/database'
import type { Investigation, InvestigationStatus, LogEvent } from '../types'
import { formatTimestamp, formatNumber } from '../utils/format'
import { useTimezone } from '../hooks/useTimezone'
import { SeverityBadge } from '../components/ui/Badge'

const STATUSES: InvestigationStatus[] = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED', 'FALSE_POSITIVE']

const STATUS_COLOR: Record<InvestigationStatus, string> = {
  OPEN: 'var(--color-low)',
  IN_PROGRESS: 'var(--color-medium)',
  RESOLVED: 'var(--color-benign)',
  CLOSED: 'var(--color-text-faint)',
  FALSE_POSITIVE: 'var(--color-text-muted)',
}

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    <div className="mx-auto max-w-[1500px] space-y-5 p-4 sm:p-6">
      <button
        onClick={() => navigate('/investigations')}
        className="inline-flex items-center gap-1.5 rounded-lg text-xs text-[color:var(--color-text-muted)] transition-colors hover:text-[color:var(--color-text)]"
      >
        <ArrowLeft size={14} /> Back to Investigations
      </button>

      <header className="hero-panel relative flex flex-wrap items-start justify-between gap-4 p-5">
        <div className="relative min-w-0">
          <div className="mb-2 flex items-center gap-2">
            <span className="font-mono-tabular text-[10px] uppercase tracking-[0.14em] text-[color:var(--color-accent-strong)]">{inv.code}</span>
            <span className="accent-rule w-8 opacity-70" />
          </div>
          <h1 className="display text-[1.4rem] font-bold leading-tight">{inv.title}</h1>
          {inv.description && <p className="mt-2 max-w-xl text-[13px] leading-relaxed text-[color:var(--color-text-muted)]">{inv.description}</p>}
          <p className="mt-3 inline-flex items-center gap-2 font-mono-tabular text-[10px] text-[color:var(--color-text-faint)]">
            <span
              aria-hidden
              className="h-1.5 w-1.5 rounded-full"
              style={{ backgroundColor: STATUS_COLOR[inv.status], boxShadow: `0 0 8px 0 ${STATUS_COLOR[inv.status]}` }}
            />
            Updated {formatTimestamp(inv.updatedAt, offsetMinutes)}
          </p>
        </div>
        <div className="relative">
          <p className="mb-1.5 text-right text-[10px] font-semibold uppercase tracking-[0.12em] text-[color:var(--color-text-faint)]">Case status</p>
          <select
            value={inv.status}
            onChange={(e) => updateStatus(e.target.value as InvestigationStatus)}
            className="rounded-lg border border-[color:var(--color-border-strong)] bg-[color:var(--color-surface)] px-3 py-2 text-xs font-semibold transition-colors focus:border-[color:var(--color-accent)]/60 focus:outline-none"
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
            ))}
          </select>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat icon={Activity} label="Total Events" value={logs.length} />
        <Stat icon={Globe2} label="Unique IPs" value={uniqueIps} />
        <Stat icon={Users} label="Unique Users" value={uniqueUsers} />
        <Stat icon={Flame} label="Critical" value={critCount} color="var(--color-critical)" />
        <Stat icon={ShieldAlert} label="High" value={susCount} color="var(--color-high)" />
      </div>

      <section className="panel relative overflow-hidden p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <div className="mb-1 flex items-center gap-2">
              <span className="eyebrow">Evidence</span>
              <span className="accent-rule w-6 opacity-70" />
            </div>
            <h2 className="display text-sm font-bold">Timeline</h2>
          </div>
          <span className="chip">{logs.length} events</span>
        </div>
        {logs.length === 0 ? (
          <p className="py-8 text-center text-xs leading-relaxed text-[color:var(--color-text-faint)]">
            No events added to this investigation yet. Use "Add to Investigation" from the log detail drawer or bulk actions.
          </p>
        ) : (
          <ol className="relative ml-2 space-y-5 border-l border-[color:var(--color-border-strong)]">
            {logs.map((log) => (
              <li key={log.id} className="relative ml-5">
                <span
                  aria-hidden
                  className="absolute -left-[26px] top-1 h-2.5 w-2.5 rounded-full ring-4 ring-[color:var(--color-bg)]"
                  style={{ backgroundColor: 'var(--color-accent)', boxShadow: '0 0 10px 0 var(--color-accent)' }}
                />
                <p className="font-mono-tabular text-[10px] text-[color:var(--color-text-faint)]">
                  {formatTimestamp(log.timestamp, offsetMinutes)}
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold">{log.eventType}</span>
                  <SeverityBadge severity={log.severity} />
                </div>
                <p className="mt-0.5 font-mono-tabular text-xs text-[color:var(--color-text-muted)]">{log.srcIp}</p>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  )
}

function Stat({
  label,
  value,
  color,
  icon: Icon,
}: {
  label: string
  value: number
  color?: string
  icon: ComponentType<{ size?: number | string }>
}) {
  return (
    <div className="stat-tile" style={color ? ({ ['--tile-color' as string]: color } as CSSProperties) : undefined}>
      <div className="mb-2 flex items-center gap-1.5 text-[color:var(--color-text-faint)]">
        <Icon size={13} />
        <p className="text-[10px] font-semibold uppercase tracking-[0.1em]">{label}</p>
      </div>
      <p className="stat-value text-xl font-bold">{formatNumber(value)}</p>
    </div>
  )
}
