import type { Summary } from '../../analysis/presentation'
import { formatNumber, formatPercent } from '../../utils/format'

function Card({
  label,
  value,
  sub,
  tone,
}: {
  label: string
  value: string
  sub?: string
  tone?: 'warn' | 'danger'
}) {
  const accent = tone === 'danger' ? 'var(--color-critical)' : tone === 'warn' ? 'var(--color-high)' : 'var(--color-accent)'
  return (
    <div className="stat-tile min-w-0" style={{ ['--tile-color' as string]: accent }}>
      <p className="mb-1.5 truncate text-[10px] font-semibold uppercase tracking-[0.12em] text-[color:var(--color-text-muted)]">
        {label}
      </p>
      <p className="stat-value truncate text-2xl font-bold leading-none">{value}</p>
      {sub && (
        <p className="mt-2 truncate text-[11px] text-[color:var(--color-text-faint)]" title={sub}>
          {sub}
        </p>
      )}
    </div>
  )
}

export function SummaryCards({ summary }: { summary: Summary | null }) {
  const s = summary
  const cards = [
    <Card
      key="req"
      label="Requests"
      value={s ? formatNumber(s.requests) : '—'}
      sub={s ? `${s.files} file${s.files === 1 ? '' : 's'} included` : undefined}
    />,
    <Card
      key="err"
      label="Errors (4xx/5xx)"
      value={s ? formatPercent(s.errorRate) : '—'}
      sub={
        s && s.errorRate !== null
          ? `${formatNumber(s.errors)} of ${formatNumber(s.httpResponses)} responses`
          : 'No HTTP status in these logs'
      }
      tone={s && s.errorRate !== null && s.errorRate >= 0.5 ? 'warn' : undefined}
    />,
    <Card
      key="auto"
      label="Automated clients"
      value={s ? formatPercent(s.automatedRate) : '—'}
      sub={
        s && s.automatedRate !== null
          ? `${formatNumber(s.automated)} of ${formatNumber(s.withUserAgent)} with a user agent`
          : 'No user agent in these logs'
      }
    />,
    <Card key="marked" label="Marked" value={s ? formatNumber(s.marked) : '—'} sub="Events you flagged" />,
  ]
  if (s && s.failedAuth > 0) {
    cards.push(
      <Card
        key="fail"
        label="Failed logins"
        value={formatNumber(s.failedAuth)}
        sub="Failed authentication events"
        tone="warn"
      />,
    )
  }
  return (
    <div className={`grid grid-cols-2 gap-3 ${cards.length > 4 ? 'lg:grid-cols-5' : 'lg:grid-cols-4'}`}>{cards}</div>
  )
}
