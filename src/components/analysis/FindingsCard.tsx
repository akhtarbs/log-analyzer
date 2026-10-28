import { ChevronRight, CircleCheck } from 'lucide-react'
import type { Finding, FindingLevel } from '../../analysis/findings'

const LEVEL: Record<FindingLevel, { label: string; color: string }> = {
  high: { label: 'High', color: 'var(--color-critical)' },
  medium: { label: 'Medium', color: 'var(--color-medium)' },
  info: { label: 'Info', color: 'var(--color-low)' },
}

export function FindingsCard({ findings, onOpen }: { findings: Finding[] | null; onOpen: (f: Finding) => void }) {
  return (
    <section className="rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-bg-raised)] p-4" aria-labelledby="findings-title">
      <div className="flex items-baseline justify-between mb-3">
        <h2 id="findings-title" className="text-sm font-semibold">Key findings</h2>
        <span className="text-[10px] text-[color:var(--color-text-faint)]">Indications only — review before acting</span>
      </div>

      {findings === null ? (
        <p className="text-xs text-[color:var(--color-text-faint)]">Analyzing…</p>
      ) : findings.length === 0 ? (
        <p className="flex items-center gap-2 text-xs text-[color:var(--color-text-muted)]">
          <CircleCheck size={14} className="text-[color:var(--color-benign)] shrink-0" />
          Nothing stands out in the loaded logs. The checks are deliberately conservative, so the list stays short.
        </p>
      ) : (
        <ul className="divide-y divide-[color:var(--color-border)]">
          {findings.map((f) => {
            const lv = LEVEL[f.level]
            const body = (
              <>
                <span className="mt-1.5 h-2 w-2 rounded-full shrink-0" style={{ background: lv.color }} aria-hidden />
                <span className="min-w-0 flex-1 text-left">
                  <span className="flex items-center gap-2">
                    <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: lv.color }}>{lv.label}</span>
                    <span className="text-sm font-medium truncate">{f.title}</span>
                  </span>
                  {f.detail && <span className="block text-xs text-[color:var(--color-text-muted)] mt-0.5">{f.detail}</span>}
                </span>
                {f.target && <ChevronRight size={16} className="mt-1 shrink-0 text-[color:var(--color-text-faint)] group-hover:text-[color:var(--color-accent)]" aria-hidden />}
              </>
            )
            return (
              <li key={f.id}>
                {f.target ? (
                  <button
                    onClick={() => onOpen(f)}
                    className="group flex w-full items-start gap-3 py-2.5 px-1 -mx-1 rounded-md hover:bg-[color:var(--color-surface-hover)]"
                    title="Open the matching events in the Log Explorer"
                  >
                    {body}
                  </button>
                ) : (
                  <div className="flex w-full items-start gap-3 py-2.5">{body}</div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
