import { useMemo, useState } from 'react'
import { Activity } from 'lucide-react'
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import {
  BUCKET_OPTIONS,
  chooseBucketMinutes,
  rebucketStacked,
  timelineSpanMinutes,
  type StackedBucket,
} from '../../analysis/aggregate'
import { bucketLabel } from '../../analysis/findings'
import type { MergedStats } from '../../analysis/aggregate'
import { formatNumber, formatTimestamp } from '../../utils/format'

/** More bars than this makes the chart unreadable and slow, so finer granularities are disabled. */
const MAX_BARS = 1500

const SERIES = [
  { key: 'c2', label: '2xx', color: 'var(--color-benign)' },
  { key: 'c3', label: '3xx', color: 'var(--color-low)' },
  { key: 'c4', label: '4xx', color: 'var(--color-medium)' },
  { key: 'c5', label: '5xx', color: 'var(--color-critical)' },
  { key: 'other', label: 'No HTTP status', color: 'var(--color-info)' },
] as const

const OPTION_LABEL: Record<number, string> = { 1: '1 minute', 5: '5 minutes', 15: '15 minutes', 30: '30 minutes', 60: '1 hour', 360: '6 hours', 1440: '1 day' }

interface Row extends StackedBucket {
  label: string
}

function Tip({ active, payload, offset }: { active?: boolean; payload?: { payload: Row }[]; offset: number }) {
  if (!active || !payload?.length) return null
  const r = payload[0].payload
  const start = formatTimestamp(r.startMs, offset).slice(0, 16)
  const end = formatTimestamp(r.startMs + r.durationMs - 1, offset).slice(11, 16)
  return (
    <div className="panel px-3 py-2 text-xs">
      <p className="font-mono-tabular mb-1 text-[color:var(--color-text-faint)]">{start} – {end}</p>
      <p className="font-semibold mb-1 text-[color:var(--color-text)]">{formatNumber(r.total)} events</p>
      {SERIES.filter((s) => r[s.key] > 0).map((s) => (
        <p key={s.key} className="flex items-center gap-2 text-[color:var(--color-text-muted)]">
          <span className="h-2 w-2 rounded-sm" style={{ background: s.color }} /> {s.label}: {formatNumber(r[s.key])}
        </p>
      ))}
      <p className="mt-1 text-[10px] text-[color:var(--color-text-faint)]">Click to open in the Log Explorer</p>
    </div>
  )
}

export function TimelineCard({
  merged,
  offsetMinutes,
  onOpenRange,
}: {
  merged: MergedStats | null
  offsetMinutes: number
  onOpenRange: (startMs: number, endMs: number) => void
}) {
  const [choice, setChoice] = useState<'auto' | number>('auto')
  const timeline = merged?.timeline ?? []
  const span = timelineSpanMinutes(timeline)
  const autoMinutes = chooseBucketMinutes(timeline)
  const bucketMinutes = choice === 'auto' ? autoMinutes : choice

  const rows: Row[] = useMemo(() => {
    if (!merged) return []
    return rebucketStacked(merged.timeline, merged.timelineStatus, bucketMinutes, offsetMinutes).map((b) => ({
      ...b,
      label: formatTimestamp(b.startMs, offsetMinutes).slice(bucketMinutes >= 1440 ? 0 : 5, bucketMinutes >= 1440 ? 10 : 16),
    }))
  }, [merged, bucketMinutes, offsetMinutes])

  const visibleSeries = SERIES.filter((s) => rows.some((r) => r[s.key] > 0))
  const hasStatus = visibleSeries.some((s) => s.key !== 'other')
  const peaks = useMemo(() => [...rows].filter((r) => r.total > 0).sort((a, b) => b.total - a.total).slice(0, 5), [rows])

  const first = timeline.length ? formatTimestamp(timeline[0][0] * 60000, offsetMinutes).slice(0, 16) : null
  const last = timeline.length ? formatTimestamp(timeline[timeline.length - 1][0] * 60000, offsetMinutes).slice(0, 16) : null

  return (
    <section className="panel p-5" aria-labelledby="timeline-title">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="icon-tile h-7 w-7 rounded-lg">
            <Activity size={14} />
          </span>
          <div>
            <h2 id="timeline-title" className="text-sm font-semibold text-[color:var(--color-text)]">
              Request timeline
            </h2>
            {first && (
              <p className="font-mono-tabular text-[10px] text-[color:var(--color-text-faint)]">
                {first} → {last}
              </p>
            )}
          </div>
        </div>
        <label className="flex items-center gap-2 text-xs text-[color:var(--color-text-muted)]">
          Group by
          <select
            value={choice}
            onChange={(e) => setChoice(e.target.value === 'auto' ? 'auto' : Number(e.target.value))}
            className="rounded-lg border border-[color:var(--color-border-strong)] bg-[color:var(--color-surface)] px-2.5 py-1.5 text-xs text-[color:var(--color-text)] transition-colors hover:border-[color:var(--color-accent)]/50"
          >
            <option value="auto">Auto ({OPTION_LABEL[autoMinutes] ?? `${autoMinutes} min`})</option>
            {BUCKET_OPTIONS.map((m) => (
              <option key={m} value={m} disabled={span / m > MAX_BARS} title={span / m > MAX_BARS ? 'Too many bars for this time span' : undefined}>
                {OPTION_LABEL[m]}
              </option>
            ))}
          </select>
        </label>
      </div>

      {rows.length === 0 ? (
        <p className="text-xs text-[color:var(--color-text-faint)] py-10 text-center">
          {merged ? 'No events with a readable timestamp in the included files.' : 'Loading…'}
        </p>
      ) : (
        <>
          <div role="img" aria-label={`Bar chart of events per ${bucketLabel(bucketMinutes)}`}>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart
                data={rows}
                margin={{ top: 4, right: 8, left: 0, bottom: 0 }}
                barCategoryGap={rows.length > 200 ? 0 : '12%'}
                onClick={(state: any) => {
                  const r: Row | undefined = state?.activePayload?.[0]?.payload
                  if (r) onOpenRange(r.startMs, r.startMs + r.durationMs - 1)
                }}
              >
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'var(--color-text-faint)' }} interval="preserveStartEnd" minTickGap={28} />
                <YAxis tick={{ fontSize: 10, fill: 'var(--color-text-faint)' }} width={48} tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 100) / 10}k` : String(v))} />
                <Tooltip content={<Tip offset={offsetMinutes} />} cursor={{ fill: 'var(--color-surface-hover)' }} />
                {(hasStatus ? visibleSeries : [{ key: 'total', label: 'Events', color: 'var(--color-accent)' }]).map((s) => (
                  <Bar key={s.key} dataKey={s.key} stackId="a" fill={s.color} isAnimationActive={false} cursor="pointer" />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>

          {hasStatus && (
            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-[11px] text-[color:var(--color-text-muted)]">
              {visibleSeries.map((s) => (
                <span key={s.key} className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-sm" style={{ background: s.color }} /> {s.label}
                </span>
              ))}
            </div>
          )}

          {peaks.length > 1 && (
            <div className="mt-4 pt-3 border-t border-[color:var(--color-border)]">
              <p className="text-[10px] uppercase tracking-wide text-[color:var(--color-text-faint)] mb-1.5">Busiest {bucketLabel(bucketMinutes)}s</p>
              <ol className="space-y-0.5">
                {peaks.map((p, i) => (
                  <li key={p.startMs}>
                    <button
                      onClick={() => onOpenRange(p.startMs, p.startMs + p.durationMs - 1)}
                      className="flex w-full items-center gap-3 rounded px-1 py-1 text-xs hover:bg-[color:var(--color-surface-hover)]"
                    >
                      <span className="w-4 text-[color:var(--color-text-faint)] text-right">{i + 1}</span>
                      <span className="font-mono-tabular flex-1 text-left">{formatTimestamp(p.startMs, offsetMinutes).slice(0, 16)}</span>
                      <span className="font-mono-tabular text-[color:var(--color-text-muted)]">{formatNumber(p.total)}</span>
                    </button>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </>
      )}
    </section>
  )
}
