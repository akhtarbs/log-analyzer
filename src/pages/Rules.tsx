import { useState } from 'react'
import { Plus, Play, ShieldAlert, X, Trash2, Sparkles } from 'lucide-react'
import { useLiveQuery } from '../hooks/useLiveQuery'
import { db } from '../db/database'
import type { DetectionRule, DetectionFinding, Severity } from '../types'
import { Button } from '../components/ui/Button'
import { PageHeader } from '../components/ui/PageHeader'
import { runDetectionRules } from '../services/ruleService'
import { bulkSetMark, addTagToLog } from '../services/logService'
import { formatTimestamp } from '../utils/format'
import { isCancelled, startTask } from '../services/progress'
import { useTimezone } from '../hooks/useTimezone'

const SEVERITY_COLOR: Record<Severity, string> = {
  CRITICAL: 'var(--color-critical)',
  HIGH: 'var(--color-high)',
  MEDIUM: 'var(--color-medium)',
  LOW: 'var(--color-low)',
  INFO: 'var(--color-info)',
}

const FIELD =
  'w-full rounded-lg border border-[color:var(--color-border-strong)] bg-[color:var(--color-surface)] px-3 py-2 text-sm transition-colors focus:border-[color:var(--color-accent)]/60 focus:outline-none'

export function Rules() {
  const rules = useLiveQuery(() => db.detectionRules.toArray(), [], [] as DetectionRule[])
  const [showCreate, setShowCreate] = useState(false)
  const [findings, setFindings] = useState<DetectionFinding[] | null>(null)
  const [running, setRunning] = useState(false)
  const { offsetMinutes } = useTimezone()

  const enabledCount = rules.filter((r) => r.enabled).length

  const toggleRule = async (rule: DetectionRule) => {
    await db.detectionRules.update(rule.id!, { enabled: !rule.enabled })
  }

  const deleteRule = async (rule: DetectionRule) => {
    if (rule.builtin) return
    await db.detectionRules.delete(rule.id!)
  }

  const runRules = async () => {
    setRunning(true)
    const task = startTask('Running detection rules', { cancellable: true })
    try {
      setFindings(await runDetectionRules(rules, task))
    } catch (e) {
      if (!isCancelled(e)) throw e
    } finally {
      task.finish()
      setRunning(false)
    }
  }

  const applyFinding = async (f: DetectionFinding) => {
    await bulkSetMark(f.logIds, 'SUSPICIOUS')
    const tag = await db.tags.where('name').equals(f.ruleName.toUpperCase().replace(/ /g, '_')).first()
    const anyTag = await db.tags.toArray()
    const matchTag = anyTag.find((t) => f.ruleName.toLowerCase().includes(t.name.toLowerCase().replace(/_/g, ' ')))
    if (matchTag) {
      await Promise.all(f.logIds.map((id) => addTagToLog(id, matchTag.id!)))
    } else if (tag) {
      await Promise.all(f.logIds.map((id) => addTagToLog(id, tag.id!)))
    }
  }

  return (
    <div className="mx-auto max-w-[1500px] space-y-5 p-4 sm:p-6">
      <PageHeader
        eyebrow="Detection Engineering"
        title="Detection Rules"
        description="Rules flag potential suspicious activity based on thresholds within a time window. They never claim an event is confirmed malicious — always review findings before acting."
        icon={ShieldAlert}
        actions={
          <>
            <Button variant="secondary" size="sm" onClick={runRules} disabled={running}>
              <Play size={14} /> {running ? 'Running…' : 'Run Rules'}
            </Button>
            <Button variant="primary" size="sm" onClick={() => setShowCreate(true)}>
              <Plus size={14} /> New Rule
            </Button>
          </>
        }
      />

      <div className="flex flex-wrap gap-2">
        <span className="chip chip-active">{rules.length} rules</span>
        <span className="chip">{enabledCount} enabled</span>
        <span className="chip">{rules.filter((r) => r.builtin).length} built-in</span>
      </div>

      <div className="space-y-2">
        {rules.map((rule) => (
          <div key={rule.id} className="panel panel-hover flex items-start justify-between gap-4 p-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="display text-sm font-semibold">{rule.name}</span>
                {rule.builtin && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-[color:var(--color-border-strong)] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-[color:var(--color-text-faint)]">
                    <Sparkles size={9} /> built-in
                  </span>
                )}
              </div>
              <p className="mt-1 text-xs leading-relaxed text-[color:var(--color-text-muted)]">{rule.description}</p>
              <p className="mt-2 inline-flex flex-wrap items-center gap-1.5 rounded-lg bg-[color:var(--color-surface)]/60 px-2 py-1 font-mono-tabular text-[10px] text-[color:var(--color-text-faint)]">
                <span className="text-[color:var(--color-accent-strong)]">IF</span>
                <span className="text-[color:var(--color-text)]">{rule.conditionEventType ?? 'any event'}</span>
                <span>from same {rule.groupByField}</span>
                <span className="text-[color:var(--color-high)]">&gt; {rule.thresholdCount}</span>
                <span>within {rule.windowSeconds}s</span>
                <span className="text-[color:var(--color-text-faint)]">→</span>
                <span style={{ color: SEVERITY_COLOR[rule.resultSeverity] }}>{rule.resultSeverity}</span>
                <span className="text-[color:var(--color-text-faint)]">·</span>
                <span className="text-[color:var(--color-violet)]">{rule.resultTag}</span>
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2 pt-0.5">
              <label className="relative inline-flex cursor-pointer items-center">
                <input type="checkbox" checked={rule.enabled} onChange={() => toggleRule(rule)} className="peer sr-only" aria-label={`Toggle ${rule.name}`} />
                <div className="h-5 w-9 rounded-full border border-[color:var(--color-border-strong)] bg-[color:var(--color-surface)] transition-colors peer-checked:border-transparent peer-checked:bg-[image:var(--accent-gradient)] peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[color:var(--color-accent)]" />
                <div className="absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-[color:var(--color-text-faint)] shadow transition-transform peer-checked:translate-x-4 peer-checked:bg-white" />
              </label>
              {!rule.builtin && (
                <button
                  onClick={() => deleteRule(rule)}
                  aria-label={`Delete rule ${rule.name}`}
                  className="rounded-lg p-1.5 text-[color:var(--color-text-faint)] transition-colors hover:bg-[color:var(--color-critical)]/12 hover:text-[color:var(--color-critical)]"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {findings && (
        <section className="panel relative overflow-hidden p-5">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <div className="mb-1 flex items-center gap-2">
                <span className="eyebrow">Results</span>
                <span className="accent-rule w-6 opacity-70" />
              </div>
              <h2 className="display text-sm font-bold">Findings</h2>
            </div>
            <span className="chip chip-active">{findings.length} matches</span>
          </div>
          {findings.length === 0 ? (
            <p className="py-8 text-center text-xs text-[color:var(--color-text-faint)]">
              No matches found for enabled rules against the current dataset.
            </p>
          ) : (
            <div className="space-y-2">
              {findings.map((f, i) => (
                <div key={i} className="panel-soft flex flex-wrap items-center justify-between gap-3 p-3">
                  <div className="min-w-0">
                    <p className="text-xs font-medium">{f.description}</p>
                    <p className="mt-0.5 font-mono-tabular text-[10px] text-[color:var(--color-text-faint)]">
                      {formatTimestamp(f.windowStart, offsetMinutes)} → {formatTimestamp(f.windowEnd, offsetMinutes)}
                    </p>
                  </div>
                  <Button variant="secondary" size="sm" onClick={() => applyFinding(f)}>Mark Suspicious</Button>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {showCreate && <CreateRuleDialog onClose={() => setShowCreate(false)} />}
    </div>
  )
}

function CreateRuleDialog({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState('')
  const [eventType, setEventType] = useState('')
  const [groupBy, setGroupBy] = useState<DetectionRule['groupByField']>('srcIp')
  const [threshold, setThreshold] = useState(10)
  const [window, setWindow] = useState(300)
  const [severity, setSeverity] = useState<Severity>('HIGH')
  const [tag, setTag] = useState('SUSPICIOUS_IP')

  const create = async () => {
    if (!name.trim()) return
    await db.detectionRules.add({
      name: name.trim(),
      description: `Custom rule: ${eventType || 'any event'} grouped by ${groupBy} > ${threshold} within ${window}s`,
      enabled: true,
      builtin: false,
      conditionEventType: eventType.trim() || null,
      groupByField: groupBy,
      thresholdCount: threshold,
      windowSeconds: window,
      resultSeverity: severity,
      resultTag: tag,
      createdAt: Date.now(),
    })
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#04060d]/70 p-4 backdrop-blur-sm">
      <div className="panel rise-in w-full max-w-md overflow-hidden">
        <div className="flex items-start justify-between gap-4 border-b border-[color:var(--color-border)]/70 px-5 py-4">
          <div>
            <div className="mb-1 flex items-center gap-2">
              <span className="eyebrow">Detection</span>
              <span className="accent-rule w-6 opacity-70" />
            </div>
            <h2 className="display text-base font-bold">New Detection Rule</h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Close dialog"
            className="rounded-lg p-1.5 text-[color:var(--color-text-muted)] transition-colors hover:bg-[color:var(--color-surface-hover)] hover:text-[color:var(--color-text)]"
          >
            <X size={16} />
          </button>
        </div>
        <div className="space-y-3 p-5">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Rule name" className={FIELD} aria-label="Rule name" />
          <input value={eventType} onChange={(e) => setEventType(e.target.value)} placeholder="Event type (e.g. SSH_LOGIN_FAILED), blank = any" className={FIELD} aria-label="Event type" />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[color:var(--color-text-faint)]">Group by</p>
              <select value={groupBy} onChange={(e) => setGroupBy(e.target.value as any)} className={FIELD} aria-label="Group by">
                <option value="srcIp">Source IP</option>
                <option value="dstIp">Destination IP</option>
                <option value="username">Username</option>
                <option value="hostname">Hostname</option>
              </select>
            </div>
            <div>
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[color:var(--color-text-faint)]">Result severity</p>
              <select value={severity} onChange={(e) => setSeverity(e.target.value as Severity)} className={FIELD} aria-label="Result severity">
                {(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO'] as Severity[]).map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[color:var(--color-text-faint)]">Threshold count</p>
              <input type="number" value={threshold} onChange={(e) => setThreshold(Number(e.target.value))} className={FIELD} aria-label="Threshold count" />
            </div>
            <div>
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[color:var(--color-text-faint)]">Window (seconds)</p>
              <input type="number" value={window} onChange={(e) => setWindow(Number(e.target.value))} className={FIELD} aria-label="Window seconds" />
            </div>
          </div>
          <input value={tag} onChange={(e) => setTag(e.target.value)} placeholder="Result tag" className={FIELD} aria-label="Result tag" />
        </div>
        <div className="flex justify-end gap-2 border-t border-[color:var(--color-border)]/70 px-5 py-3.5">
          <Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
          <Button variant="primary" size="sm" onClick={create}>Create Rule</Button>
        </div>
      </div>
    </div>
  )
}
