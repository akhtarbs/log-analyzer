import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, Copy, Download, ExternalLink, Target, X } from 'lucide-react'
import type { MergedStats } from '../../analysis/aggregate'
import {
  TAB_LABELS,
  TAB_SINGULAR,
  availableTabs,
  indicatorCsv,
  indicatorRows,
  indicatorTarget,
  type Badge,
  type IndicatorRow,
  type IndicatorTab,
} from '../../analysis/presentation'
import type { ExplorerTarget } from '../../services/explorerTarget'
import { downloadText } from '../../services/exportService'
import { analyzeIp, type IpAnalysis } from '../../services/logService'
import { Button } from '../ui/Button'
import { formatNumber, formatPercent, formatTimestamp } from '../../utils/format'

const TONE: Record<Badge['tone'], string> = {
  danger: 'var(--color-critical)',
  warn: 'var(--color-high)',
  info: 'var(--color-low)',
  ok: 'var(--color-benign)',
}

function BadgePill({ badge }: { badge: Badge }) {
  const c = TONE[badge.tone]
  return (
    <span
      className="inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-semibold"
      style={{
        color: c,
        background: `color-mix(in oklab, ${c} 13%, transparent)`,
        boxShadow: `inset 0 0 0 1px color-mix(in oklab, ${c} 32%, transparent)`,
      }}
    >
      {badge.label}
    </span>
  )
}

export function IndicatorsCard({
  merged,
  offsetMinutes,
  onOpenTarget,
}: {
  merged: MergedStats | null
  offsetMinutes: number
  onOpenTarget: (t: ExplorerTarget) => void
}) {
  const [tab, setTab] = useState<IndicatorTab>('ip')
  const [selected, setSelected] = useState<IndicatorRow | null>(null)

  const tabs = merged ? availableTabs(merged) : (['ip', 'userAgent', 'url', 'status'] as IndicatorTab[])
  const activeTab = tabs.includes(tab) ? tab : tabs[0]
  const rows = useMemo(() => (merged ? indicatorRows(merged, activeTab, 10) : []), [merged, activeTab])
  const max = rows[0]?.count ?? 1

  const exportCsv = () => {
    if (!merged) return
    downloadText(indicatorCsv(activeTab, indicatorRows(merged, activeTab, Infinity)), `indicators-${activeTab}.csv`)
  }

  return (
    <section className="panel p-5" aria-labelledby="indicators-title">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="icon-tile h-7 w-7 rounded-lg">
            <Target size={14} />
          </span>
          <h2 id="indicators-title" className="text-sm font-semibold text-[color:var(--color-text)]">
            Indicators
          </h2>
        </div>
        <Button variant="ghost" size="sm" onClick={exportCsv} disabled={!merged || rows.length === 0} title="Download this list (up to 1,000 entries) as CSV">
          <Download size={14} /> Export CSV
        </Button>
      </div>

      <div role="tablist" aria-label="Indicator type" className="mb-3 flex flex-wrap gap-1.5">
        {tabs.map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={t === activeTab}
            onClick={() => setTab(t)}
            className={`chip ${t === activeTab ? 'chip-active' : ''}`}
          >
            {TAB_LABELS[t]}
          </button>
        ))}
      </div>

      {!merged ? (
        <p className="text-xs text-[color:var(--color-text-faint)]">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-xs text-[color:var(--color-text-faint)]">No {TAB_LABELS[activeTab].toLowerCase()} data in the included files.</p>
      ) : (
        <ol role="tabpanel" className="divide-y divide-[color:var(--color-border)]">
          {rows.map((r, i) => (
            <li key={r.value}>
              <button
                onClick={() => setSelected(r)}
                className="group grid w-full grid-cols-[1.25rem_minmax(0,1fr)] sm:grid-cols-[1.25rem_minmax(0,1.4fr)_minmax(0,1fr)_4.5rem] items-center gap-x-3 gap-y-1 px-1 -mx-1 py-2 rounded-md text-left hover:bg-[color:var(--color-surface-hover)]"
                title="Show details"
              >
                <span className="text-[11px] text-[color:var(--color-text-faint)] text-right">{i + 1}</span>
                <span className="min-w-0">
                  <span className="block truncate text-xs font-mono-tabular group-hover:text-[color:var(--color-accent)]" title={r.value}>{r.value}</span>
                  {r.badges.length > 0 && (
                    <span className="mt-1 flex flex-wrap gap-1">
                      {r.badges.map((b) => <BadgePill key={b.label} badge={b} />)}
                    </span>
                  )}
                </span>
                <span className="hidden sm:flex items-center gap-2">
                  <span className="flex-1 h-1.5 rounded-full bg-[color:var(--color-surface)] overflow-hidden">
                    <span className="block h-full rounded-full bg-[image:var(--accent-gradient)] opacity-80" style={{ width: `${(r.count / max) * 100}%` }} />
                  </span>
                  <span className="w-10 text-right text-[11px] font-mono-tabular text-[color:var(--color-text-muted)]">{formatPercent(r.share)}</span>
                </span>
                <span className="hidden sm:block text-right text-xs font-mono-tabular text-[color:var(--color-text-muted)]">{formatNumber(r.count)}</span>
              </button>
            </li>
          ))}
        </ol>
      )}

      {selected && merged && (
        <IndicatorDetail
          tab={activeTab}
          row={selected}
          offsetMinutes={offsetMinutes}
          onClose={() => setSelected(null)}
          onOpen={() => onOpenTarget(indicatorTarget(activeTab, selected.value))}
        />
      )}
    </section>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-[color:var(--color-text-faint)]">{label}</p>
      <p className="font-mono-tabular text-sm">{value}</p>
    </div>
  )
}

function IndicatorDetail({
  tab,
  row,
  offsetMinutes,
  onClose,
  onOpen,
}: {
  tab: IndicatorTab
  row: IndicatorRow
  offsetMinutes: number
  onClose: () => void
  onOpen: () => void
}) {
  const [copied, setCopied] = useState(false)
  const [ipInfo, setIpInfo] = useState<IpAnalysis | null>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const e = row.ip

  useEffect(() => {
    closeRef.current?.focus()
    const onKey = (ev: KeyboardEvent) => ev.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    if (tab !== 'ip') return
    let stale = false
    analyzeIp(row.value).then((r) => !stale && setIpInfo(r))
    return () => {
      stale = true
    }
  }, [tab, row.value])

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(row.value)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* clipboard unavailable (e.g. insecure context) — nothing useful to do */
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4 backdrop-blur-sm" onMouseDown={(ev) => ev.target === ev.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-labelledby="indicator-title" className="panel w-full max-w-md overflow-hidden">
        <div className="flex items-center justify-between border-b border-[color:var(--color-border)] px-5 py-3.5">
          <h2 id="indicator-title" className="display text-sm font-semibold">{TAB_SINGULAR[tab]}</h2>
          <button ref={closeRef} onClick={onClose} aria-label="Close" className="rounded-md p-1 text-[color:var(--color-text-muted)] transition-colors hover:bg-[color:var(--color-surface-hover)] hover:text-[color:var(--color-text)]">
            <X size={16} />
          </button>
        </div>

        <div className="space-y-4 p-5">
          <p className="break-all rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)]/70 p-2.5 font-mono-tabular text-xs">{row.value}</p>

          {row.badges.length > 0 && <div className="flex flex-wrap gap-1">{row.badges.map((b) => <BadgePill key={b.label} badge={b} />)}</div>}

          <div className="grid grid-cols-2 gap-4">
            <Stat label="Events" value={formatNumber(row.count)} />
            <Stat label="Share of all events" value={formatPercent(row.share)} />
            {e && (
              <>
                <Stat label="Errors (4xx/5xx)" value={`${formatNumber(e.err)} (${formatPercent(e.n ? e.err / e.n : null)})`} />
                <Stat label="Automated client" value={e.tool ? `${formatNumber(e.auto)} (${e.tool})` : formatNumber(e.auto)} />
                <Stat label="Sensitive paths" value={formatNumber(e.sens)} />
                <Stat label="Suspicious payloads" value={formatNumber(e.inj)} />
              </>
            )}
            {tab === 'ip' && ipInfo && (
              <>
                <Stat label="First seen" value={formatTimestamp(ipInfo.firstSeen, offsetMinutes)} />
                <Stat label="Last seen" value={formatTimestamp(ipInfo.lastSeen, offsetMinutes)} />
                <Stat label="Failed logins" value={formatNumber(ipInfo.failedLogin)} />
                <Stat label="Successful logins" value={formatNumber(ipInfo.successfulLogin)} />
                <Stat label="Unique destinations" value={formatNumber(ipInfo.uniqueDestinations)} />
                <Stat label="Unique ports" value={formatNumber(ipInfo.uniquePorts)} />
              </>
            )}
          </div>
          <p className="text-[10px] text-[color:var(--color-text-faint)]">
            Flags are indications from simple patterns, not a verdict — confirm in the log lines before acting.
          </p>
        </div>

        <div className="flex justify-between gap-2 border-t border-[color:var(--color-border)] px-5 py-3.5">
          <Button variant="ghost" size="sm" onClick={copy}>
            {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? 'Copied' : 'Copy IoC'}
          </Button>
          <Button variant="primary" size="sm" onClick={onOpen}>
            <ExternalLink size={14} /> Open in Log Explorer
          </Button>
        </div>
      </div>
    </div>
  )
}
