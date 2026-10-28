import { useState } from 'react'
import { Plus, Play, ShieldAlert, X, Trash2 } from 'lucide-react'
import { useLiveQuery } from '../hooks/useLiveQuery'
import { db } from '../db/database'
import type { DetectionRule, DetectionFinding, Severity } from '../types'
import { Button } from '../components/ui/Button'
import { runDetectionRules } from '../services/ruleService'
import { bulkSetMark, addTagToLog } from '../services/logService'
import { formatTimestamp } from '../utils/format'
import { isCancelled, startTask } from '../services/progress'
import { useTimezone } from '../hooks/useTimezone'

export function Rules() {
  const rules = useLiveQuery(() => db.detectionRules.toArray(), [], [] as DetectionRule[])
  const [showCreate, setShowCreate] = useState(false)
  const [findings, setFindings] = useState<DetectionFinding[] | null>(null)
  const [running, setRunning] = useState(false)
  const { offsetMinutes } = useTimezone()

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
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold flex items-center gap-2">
          <ShieldAlert size={18} className="text-[color:var(--color-accent)]" /> Detection Rules
        </h1>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={runRules} disabled={running}>
            <Play size={14} /> {running ? 'Running…' : 'Run Rules'}
          </Button>
          <Button variant="primary" size="sm" onClick={() => setShowCreate(true)}>
            <Plus size={14} /> New Rule
          </Button>
        </div>
      </div>

      <p className="text-xs text-[color:var(--color-text-faint)] max-w-2xl">
        Rules flag <span className="text-[color:var(--color-text-muted)]">potential suspicious activity</span> based on thresholds within a time window. They never claim an event is confirmed malicious — always review findings before acting.
      </p>

      <div className="space-y-2">
        {rules.map((rule) => (
          <div key={rule.id} className="flex items-center justify-between rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg-raised)] p-3.5">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold">{rule.name}</span>
                {rule.builtin && <span className="text-[9px] uppercase tracking-wide text-[color:var(--color-text-faint)] border border-[color:var(--color-border-strong)] rounded px-1">built-in</span>}
              </div>
              <p className="text-xs text-[color:var(--color-text-muted)] mt-0.5">{rule.description}</p>
              <p className="text-[10px] text-[color:var(--color-text-faint)] font-mono-tabular mt-1">
                IF {rule.conditionEventType ?? 'any event'} from same {rule.groupByField} &gt; {rule.thresholdCount} within {rule.windowSeconds}s → severity {rule.resultSeverity}, tag {rule.resultTag}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" checked={rule.enabled} onChange={() => toggleRule(rule)} className="sr-only peer" />
                <div className="w-9 h-5 bg-[color:var(--color-surface)] border border-[color:var(--color-border-strong)] rounded-full peer-checked:bg-[color:var(--color-accent)]/40 transition-colors" />
                <div className="absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-[color:var(--color-text-faint)] peer-checked:bg-[color:var(--color-accent)] peer-checked:translate-x-4 transition-transform" />
              </label>
              {!rule.builtin && (
                <button onClick={() => deleteRule(rule)} className="text-[color:var(--color-text-faint)] hover:text-[color:var(--color-critical)]">
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {findings && (
        <div className="rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-bg-raised)] p-4">
          <h2 className="text-sm font-semibold mb-3">Findings ({findings.length})</h2>
          {findings.length === 0 ? (
            <p className="text-xs text-[color:var(--color-text-faint)]">No matches found for enabled rules against the current dataset.</p>
          ) : (
            <div className="space-y-2">
              {findings.map((f, i) => (
                <div key={i} className="flex items-center justify-between rounded-md bg-[color:var(--color-surface)] p-2.5">
                  <div>
                    <p className="text-xs font-medium">{f.description}</p>
                    <p className="text-[10px] text-[color:var(--color-text-faint)] font-mono-tabular">
                      {formatTimestamp(f.windowStart, offsetMinutes)} → {formatTimestamp(f.windowEnd, offsetMinutes)}
                    </p>
                  </div>
                  <Button variant="secondary" size="sm" onClick={() => applyFinding(f)}>Mark Suspicious</Button>
                </div>
              ))}
            </div>
          )}
        </div>
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-bg-raised)] shadow-2xl">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-[color:var(--color-border)]">
          <h2 className="text-sm font-semibold">New Detection Rule</h2>
          <button onClick={onClose} className="text-[color:var(--color-text-muted)] hover:text-[color:var(--color-text)]"><X size={16} /></button>
        </div>
        <div className="p-5 space-y-3 text-sm">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Rule name" className="w-full rounded-md border border-[color:var(--color-border-strong)] bg-[color:var(--color-surface)] px-3 py-2 text-sm" />
          <input value={eventType} onChange={(e) => setEventType(e.target.value)} placeholder="Event type (e.g. SSH_LOGIN_FAILED), blank = any" className="w-full rounded-md border border-[color:var(--color-border-strong)] bg-[color:var(--color-surface)] px-3 py-2 text-sm" />
          <div className="grid grid-cols-2 gap-2">
            <div>
              <p className="text-xs text-[color:var(--color-text-muted)] mb-1">Group by</p>
              <select value={groupBy} onChange={(e) => setGroupBy(e.target.value as any)} className="w-full rounded-md border border-[color:var(--color-border-strong)] bg-[color:var(--color-surface)] px-2 py-1.5 text-xs">
                <option value="srcIp">Source IP</option>
                <option value="dstIp">Destination IP</option>
                <option value="username">Username</option>
                <option value="hostname">Hostname</option>
              </select>
            </div>
            <div>
              <p className="text-xs text-[color:var(--color-text-muted)] mb-1">Result severity</p>
              <select value={severity} onChange={(e) => setSeverity(e.target.value as Severity)} className="w-full rounded-md border border-[color:var(--color-border-strong)] bg-[color:var(--color-surface)] px-2 py-1.5 text-xs">
                {(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO'] as Severity[]).map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <p className="text-xs text-[color:var(--color-text-muted)] mb-1">Threshold count</p>
              <input type="number" value={threshold} onChange={(e) => setThreshold(Number(e.target.value))} className="w-full rounded-md border border-[color:var(--color-border-strong)] bg-[color:var(--color-surface)] px-2 py-1.5 text-xs" />
            </div>
            <div>
              <p className="text-xs text-[color:var(--color-text-muted)] mb-1">Window (seconds)</p>
              <input type="number" value={window} onChange={(e) => setWindow(Number(e.target.value))} className="w-full rounded-md border border-[color:var(--color-border-strong)] bg-[color:var(--color-surface)] px-2 py-1.5 text-xs" />
            </div>
          </div>
          <input value={tag} onChange={(e) => setTag(e.target.value)} placeholder="Result tag" className="w-full rounded-md border border-[color:var(--color-border-strong)] bg-[color:var(--color-surface)] px-3 py-2 text-sm" />
        </div>
        <div className="flex justify-end gap-2 px-5 py-3.5 border-t border-[color:var(--color-border)]">
          <Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
          <Button variant="primary" size="sm" onClick={create}>Create Rule</Button>
        </div>
      </div>
    </div>
  )
}
