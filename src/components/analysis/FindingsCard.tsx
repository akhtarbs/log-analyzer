import { ChevronRight, CircleCheck, ListChecks } from 'lucide-react'
import type { Finding, FindingLevel } from '../../analysis/findings'

const LEVEL: Record<FindingLevel, { label: string; color: string }> = {
  high: { label: 'High', color: 'var(--color-critical)' },
  medium: { label: 'Medium', color: 'var(--color-medium)' },
  info: { label: 'Info', color: 'var(--color-low)' },
}

export function FindingsCard({ findings, onOpen }: { findings: Finding[] | null; onOpen: (f: Finding) => void }) {
  return (
    <section className="panel p-5" aria-labelledby="findings-title">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="icon-tile h-7 w-7 rounded-lg">
            <ListChecks size={14} />
          </span>
          <div>
            <h2 id="findings-title" className="text-sm font-semibold text-[color:var(--color-text)]">
              Key findings
            </h2>
            <p className="text-[10px] text-[color:var(--color-text-faint)]">Indications only — review before acting</p>
          </div>
        </div>
      </div>

      {findings === null ? (
        <p className="text-xs text-[color:var(--color-text-faint)]">Analyzing…</p>
      ) : findings.length === 0 ? (
        <p className="flex items-center gap-2 text-xs text-[color:var(--color-text-muted)]">
          <CircleCheck size={14} className="shrink-0 text-[color:var(--color-benign)]" />
          Nothing stands out in the loaded logs. The checks are deliberately conservative, so the list stays short.
        </p>
      ) : (
        <ul className="divide-y divide-[color:var(--color-border)]">
          {findings.map((f) => {
            const lv = LEVEL[f.level]
            const body = (
              <>
                <span
                  className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                  style={{ background: lv.color, boxShadow: `0 0 8px 0 ${lv.color}` }}
                  aria-hidden
                />
                <span className="min-w-0 flex-1 text-left">
                  <span className="flex flex-wrap items-center gap-2">
                    <span
                      className="rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.08em]"
                      style={{
                        color: lv.color,
                        background: `color-mix(in oklab, ${lv.color} 14%, transparent)`,
                      }}
                    >
                      {lv.label}
                    </span>
                    <span className="truncate text-sm font-medium text-[color:var(--color-text)]">{f.title}</span>
                  </span>
                  {f.detail && (
                    <span className="mt-0.5 block text-xs leading-relaxed text-[color:var(--color-text-muted)]">
                      {f.detail}
                    </span>
                  )}
                </span>
                {f.target && (
                  <ChevronRight
                    size={16}
                    className="mt-1 shrink-0 text-[color:var(--color-text-faint)] group-hover:translate-x-0.5 group-hover:text-[color:var(--color-accent-strong)]"
                    aria-hidden
                  />
                )}
              </>
            )
            return (
              <li key={f.id}>
                {f.target ? (
                  <button
                    onClick={() => onOpen(f)}
                    className="group -mx-1.5 flex w-full items-start gap-3 rounded-lg px-1.5 py-2.5 transition-colors hover:bg-[color:var(--color-surface-hover)]/70"
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
