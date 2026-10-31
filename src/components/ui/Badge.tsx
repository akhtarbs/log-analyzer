import type { MarkType, Severity } from '../../types'
import { cn } from '../../utils/cn'

const SEVERITY_VAR: Record<Severity, string> = {
  CRITICAL: 'var(--color-critical)',
  HIGH: 'var(--color-high)',
  MEDIUM: 'var(--color-medium)',
  LOW: 'var(--color-low)',
  INFO: 'var(--color-info)',
}

export function SeverityBadge({ severity, className }: { severity: Severity; className?: string }) {
  const color = SEVERITY_VAR[severity]
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 font-mono-tabular text-[10px] font-bold uppercase tracking-[0.08em]',
        className,
      )}
      style={{
        color,
        border: `1px solid color-mix(in oklab, ${color} 40%, transparent)`,
        background: `color-mix(in oklab, ${color} 14%, transparent)`,
      }}
    >
      <span
        aria-hidden
        className="h-1.5 w-1.5 rounded-full"
        style={{ backgroundColor: color, boxShadow: `0 0 8px 0 ${color}` }}
      />
      {severity}
    </span>
  )
}

const MARK_META: Record<Exclude<MarkType, null>, { color: string; label: string }> = {
  CRITICAL: { color: 'var(--color-critical)', label: 'Critical' },
  SUSPICIOUS: { color: 'var(--color-high)', label: 'Suspicious' },
  REVIEW: { color: 'var(--color-medium)', label: 'Review' },
  BENIGN: { color: 'var(--color-benign)', label: 'Benign' },
  INFO: { color: 'var(--color-low)', label: 'Info' },
}

export function MarkBadge({ mark }: { mark: MarkType }) {
  if (!mark) return <span className="text-[color:var(--color-text-faint)] text-xs">—</span>
  const meta = MARK_META[mark]
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold"
      style={{
        color: meta.color,
        background: `color-mix(in oklab, ${meta.color} 12%, transparent)`,
        boxShadow: `inset 0 0 0 1px color-mix(in oklab, ${meta.color} 30%, transparent)`,
      }}
    >
      <span
        aria-hidden
        className="h-1.5 w-1.5 rounded-full"
        style={{ backgroundColor: meta.color }}
      />
      {meta.label}
    </span>
  )
}

export const MARK_OPTIONS: { value: Exclude<MarkType, null>; icon: string; label: string }[] = [
  { value: 'CRITICAL', icon: '🔴', label: 'Critical' },
  { value: 'SUSPICIOUS', icon: '🟠', label: 'Suspicious' },
  { value: 'REVIEW', icon: '🟡', label: 'Review' },
  { value: 'BENIGN', icon: '🟢', label: 'Benign' },
  { value: 'INFO', icon: '🔵', label: 'Info' },
]
