import type { MarkType, Severity } from '../../types'
import { cn } from '../../utils/cn'

const SEVERITY_STYLE: Record<Severity, string> = {
  CRITICAL: 'bg-[color-mix(in_oklab,var(--color-critical)_16%,transparent)] text-[color:var(--color-critical)] border-[color:var(--color-critical)]/30',
  HIGH: 'bg-[color-mix(in_oklab,var(--color-high)_16%,transparent)] text-[color:var(--color-high)] border-[color:var(--color-high)]/30',
  MEDIUM: 'bg-[color-mix(in_oklab,var(--color-medium)_16%,transparent)] text-[color:var(--color-medium)] border-[color:var(--color-medium)]/30',
  LOW: 'bg-[color-mix(in_oklab,var(--color-low)_16%,transparent)] text-[color:var(--color-low)] border-[color:var(--color-low)]/30',
  INFO: 'bg-[color-mix(in_oklab,var(--color-info)_16%,transparent)] text-[color:var(--color-info)] border-[color:var(--color-info)]/30',
}

export function SeverityBadge({ severity }: { severity: Severity }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-mono-tabular font-semibold uppercase tracking-wide border',
        SEVERITY_STYLE[severity],
      )}
    >
      {severity}
    </span>
  )
}

const MARK_META: Record<Exclude<MarkType, null>, { icon: string; color: string; label: string }> = {
  CRITICAL: { icon: '🔴', color: 'var(--color-critical)', label: 'Critical' },
  SUSPICIOUS: { icon: '🟠', color: 'var(--color-high)', label: 'Suspicious' },
  REVIEW: { icon: '🟡', color: 'var(--color-medium)', label: 'Review' },
  BENIGN: { icon: '🟢', color: 'var(--color-benign)', label: 'Benign' },
  INFO: { icon: '🔵', color: 'var(--color-low)', label: 'Info' },
}

export function MarkBadge({ mark }: { mark: MarkType }) {
  if (!mark) return <span className="text-[color:var(--color-text-faint)] text-xs">—</span>
  const meta = MARK_META[mark]
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium" style={{ color: meta.color }}>
      <span aria-hidden>{meta.icon}</span>
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
