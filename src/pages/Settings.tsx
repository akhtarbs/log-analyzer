import { useEffect, useState } from 'react'
import type { ComponentType, CSSProperties, ReactNode } from 'react'
import { Settings as SettingsIcon, Download, Upload, Trash2, HardDrive, AlertTriangle, Files, Clock } from 'lucide-react'
import { useLiveQuery } from '../hooks/useLiveQuery'
import { db } from '../db/database'
import { Button } from '../components/ui/Button'
import { PageHeader } from '../components/ui/PageHeader'
import { LogFilesPanel } from '../components/logs/LogFilesPanel'
import { formatBytes, formatNumber, formatTimestamp } from '../utils/format'
import { exportBackup, restoreBackup, type RestoreMode } from '../services/backupService'
import { useTimezone, TIMEZONE_OPTIONS } from '../hooks/useTimezone'
import { rebuildAllStats } from '../services/statsService'
import { isCancelled, startTask } from '../services/progress'

export function SettingsPage() {
  // Event total comes from the per-file counts — counting a table of millions of rows would be slow.
  const eventCount = useLiveQuery(async () => (await db.logFiles.toArray()).reduce((sum, f) => sum + f.eventCount, 0), [], 0)
  const fileCount = useLiveQuery(() => db.logFiles.count(), [], 0)
  const markedCount = useLiveQuery(
    () => db.logs.where('mark').anyOf(['CRITICAL', 'SUSPICIOUS', 'REVIEW', 'BENIGN', 'INFO']).count(),
    [],
    0,
  )
  const invCount = useLiveQuery(() => db.investigations.count(), [], 0)

  const [storageEstimate, setStorageEstimate] = useState<{ usage: number; quota: number } | null>(null)
  const [includeOriginal, setIncludeOriginal] = useState(false)
  const [restoreMode, setRestoreMode] = useState<RestoreMode>('merge')
  const [confirmClear, setConfirmClear] = useState(false)
  const [restoreConfirm, setRestoreConfirm] = useState<File | null>(null)
  const [showFilesPanel, setShowFilesPanel] = useState(false)
  const [busy, setBusy] = useState(false)
  const [statsMessage, setStatsMessage] = useState<string | null>(null)

  const handleRebuildStats = async () => {
    setBusy(true)
    setStatsMessage(null)
    const task = startTask('Rebuilding statistics', { cancellable: true })
    try {
      const n = await rebuildAllStats(task)
      setStatsMessage(`Statistics rebuilt for ${n} file${n === 1 ? '' : 's'}.`)
    } catch (e) {
      if (!isCancelled(e)) throw e
      setStatsMessage('Cancelled — missing statistics are rebuilt automatically the next time they are needed.')
    } finally {
      task.finish()
      setBusy(false)
    }
  }

  useEffect(() => {
    if (navigator.storage?.estimate) {
      navigator.storage.estimate().then((est) => setStorageEstimate({ usage: est.usage ?? 0, quota: est.quota ?? 0 }))
    }
  }, [eventCount])

  const handleBackup = async () => {
    setBusy(true)
    await exportBackup(includeOriginal)
    setBusy(false)
  }

  const handleRestoreFile = (file: File) => {
    setRestoreConfirm(file)
  }

  const confirmRestore = async () => {
    if (!restoreConfirm) return
    setBusy(true)
    await restoreBackup(restoreConfirm, restoreMode)
    setBusy(false)
    setRestoreConfirm(null)
  }

  const handleClearAll = async () => {
    setBusy(true)
    await db.delete()
    setBusy(false)
    window.location.reload()
  }

  const storagePercent = storageEstimate && storageEstimate.quota > 0
    ? Math.min(100, (storageEstimate.usage / storageEstimate.quota) * 100)
    : 0

  return (
    <div className="mx-auto max-w-4xl space-y-5 p-4 sm:p-6">
      <PageHeader
        eyebrow="Workspace"
        title="Settings"
        description="Display preferences, local data management, and backup tooling. Everything stays on this device."
        icon={SettingsIcon}
      />

      <TimezoneSection />

      {/* Data Management */}
      <Section icon={HardDrive} title="Data Management" eyebrow="Storage">
        <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatBox label="Events" value={formatNumber(eventCount)} tone="var(--color-accent)" />
          <StatBox label="Log Files" value={formatNumber(fileCount)} tone="var(--color-violet)" />
          <StatBox label="Marked" value={formatNumber(markedCount)} tone="var(--color-high)" />
          <StatBox label="Investigations" value={formatNumber(invCount)} tone="var(--color-cyan)" />
        </div>
        {storageEstimate && (
          <div className="mb-4 rounded-xl bg-[color:var(--color-surface)]/50 p-3.5">
            <div className="mb-2 flex items-center justify-between text-xs">
              <span className="text-[color:var(--color-text-muted)]">Local storage used</span>
              <span className="font-mono-tabular text-[color:var(--color-text)]">
                {formatBytes(storageEstimate.usage)} {storageEstimate.quota > 0 && <span className="text-[color:var(--color-text-faint)]">of {formatBytes(storageEstimate.quota)}</span>}
              </span>
            </div>
            {storageEstimate.quota > 0 && (
              <div className="h-2 overflow-hidden rounded-full bg-[color:var(--color-bg)]">
                <div className="h-full rounded-full bg-[image:var(--accent-gradient)] transition-all" style={{ width: `${storagePercent}%` }} />
              </div>
            )}
          </div>
        )}
        <Button variant="danger" size="sm" onClick={() => setConfirmClear(true)}>
          <Trash2 size={14} /> Clear All Data
        </Button>
      </Section>

      {/* Log Files */}
      <Section icon={Files} title="Log Files" eyebrow="Corpus">
        <p className="mb-3 text-xs leading-relaxed text-[color:var(--color-text-muted)]">
          View every imported file, and choose which ones are included in analysis. Excluded files stay in storage but are hidden from the dashboard, analysis, and detection rules.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => setShowFilesPanel(true)}>
            <Files size={14} /> Manage Log Files
          </Button>
          <Button variant="secondary" size="sm" onClick={handleRebuildStats} disabled={busy}>
            Rebuild statistics
          </Button>
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-[color:var(--color-text-faint)]">
          Dashboard and Analysis read pre-computed per-file statistics, which are built when a file is imported. Rebuild only if numbers ever look wrong.
        </p>
        {statsMessage && <p className="mt-1 text-xs text-[color:var(--color-benign)]">{statsMessage}</p>}
      </Section>

      {/* Backup */}
      <Section icon={Download} title="Backup" eyebrow="Portability">
        <p className="mb-3 text-xs leading-relaxed text-[color:var(--color-text-muted)]">
          Exports metadata, marks, tags, investigations, saved filters, detection rules, and settings as a local file. Nothing is sent anywhere.
        </p>
        <label className="mb-3 flex items-center gap-2 text-xs text-[color:var(--color-text-muted)]">
          <input type="checkbox" checked={includeOriginal} onChange={(e) => setIncludeOriginal(e.target.checked)} className="accent-[color:var(--color-accent)]" />
          Include original log files (creates a .zip)
        </label>
        <Button variant="secondary" size="sm" onClick={handleBackup} disabled={busy}>
          <Download size={14} /> Export Backup
        </Button>
      </Section>

      {/* Restore */}
      <Section icon={Upload} title="Restore" eyebrow="Portability">
        <p className="mb-3 text-xs leading-relaxed text-[color:var(--color-text-muted)]">
          Load a backup file to bring this workspace back. Merge keeps existing data; replace wipes it first.
        </p>
        <label className="inline-block">
          <span className="sr-only">Restore backup</span>
          <input
            type="file"
            accept=".json,.zip"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && handleRestoreFile(e.target.files[0])}
            id="restore-input"
          />
          <Button variant="secondary" size="sm" onClick={() => document.getElementById('restore-input')?.click()}>
            <Upload size={14} /> Restore Backup
          </Button>
        </label>
      </Section>

      {/* Restore confirm dialog */}
      {restoreConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#04060d]/70 p-4 backdrop-blur-sm">
          <div className="panel rise-in w-full max-w-sm overflow-hidden">
            <div className="border-b border-[color:var(--color-border)]/70 px-5 py-4">
              <div className="mb-1 flex items-center gap-2">
                <span className="eyebrow">Restore</span>
                <span className="accent-rule w-6 opacity-70" />
              </div>
              <p className="display text-sm font-bold">Existing data detected</p>
            </div>
            <div className="p-5">
              <p className="mb-4 text-xs text-[color:var(--color-text-muted)]">
                Choose how to restore <span className="font-mono-tabular text-[color:var(--color-text)]">{restoreConfirm.name}</span>.
              </p>
              <div className="mb-4 flex gap-2">
                {(['merge', 'replace'] as RestoreMode[]).map((m) => (
                  <button
                    key={m}
                    onClick={() => setRestoreMode(m)}
                    className={`flex-1 rounded-lg border px-3 py-2 text-xs font-semibold capitalize transition-colors ${
                      restoreMode === m
                        ? 'border-[color:var(--color-accent)]/55 bg-[color:var(--color-accent)]/12 text-[color:var(--color-accent-strong)]'
                        : 'border-[color:var(--color-border-strong)] text-[color:var(--color-text-muted)] hover:bg-[color:var(--color-surface-hover)]'
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={() => setRestoreConfirm(null)}>Cancel</Button>
                <Button variant="primary" size="sm" onClick={confirmRestore} disabled={busy}>{busy ? 'Restoring…' : 'Restore'}</Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Clear confirm dialog */}
      {confirmClear && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#04060d]/70 p-4 backdrop-blur-sm">
          <div className="panel rise-in w-full max-w-sm overflow-hidden border-[color:var(--color-critical)]/40">
            <div className="border-b border-[color:var(--color-critical)]/25 px-5 py-4">
              <div className="flex items-center gap-2 text-[color:var(--color-critical)]">
                <AlertTriangle size={18} />
                <p className="text-sm font-semibold">Delete all local data?</p>
              </div>
            </div>
            <p className="px-5 py-4 text-xs leading-relaxed text-[color:var(--color-text-muted)]">
              This will permanently delete every imported log, mark, tag, investigation, saved filter, and rule. This action cannot be undone.
            </p>
            <div className="flex justify-end gap-2 border-t border-[color:var(--color-border)]/70 px-5 py-3">
              <Button variant="secondary" size="sm" onClick={() => setConfirmClear(false)}>Cancel</Button>
              <Button variant="danger" size="sm" onClick={handleClearAll} disabled={busy}>Delete Everything</Button>
            </div>
          </div>
        </div>
      )}

      {showFilesPanel && <LogFilesPanel onClose={() => setShowFilesPanel(false)} onChanged={() => {}} />}
    </div>
  )
}

function Section({
  icon: Icon,
  title,
  eyebrow,
  children,
}: {
  icon: ComponentType<{ size?: number | string }>
  title: string
  eyebrow: string
  children: ReactNode
}) {
  return (
    <section className="panel relative overflow-hidden p-5">
      <div className="mb-4 flex items-center gap-2.5">
        <span className="icon-tile">
          <Icon size={16} />
        </span>
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h2 className="display text-sm font-bold leading-tight">{title}</h2>
        </div>
      </div>
      {children}
    </section>
  )
}

function StatBox({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="stat-tile !p-3" style={tone ? ({ ['--tile-color' as string]: tone } as CSSProperties) : undefined}>
      <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-[color:var(--color-text-faint)]">{label}</p>
      <p className="stat-value text-lg font-bold">{value}</p>
    </div>
  )
}

function TimezoneSection() {
  const { offsetMinutes, setOffsetMinutes } = useTimezone()
  const now = Date.now()

  return (
    <Section icon={Clock} title="Timezone" eyebrow="Display">
      <p className="mb-3 text-xs leading-relaxed text-[color:var(--color-text-muted)]">
        Choose the UTC/GMT offset used to display every timestamp in the app — the Log Explorer table, log details, dashboard, analysis, investigations, and the time-range filter. This only changes how times are displayed; the underlying data is always stored and matched in UTC, so nothing needs re-importing.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={offsetMinutes}
          onChange={(e) => setOffsetMinutes(Number(e.target.value))}
          aria-label="Display timezone"
          className="rounded-lg border border-[color:var(--color-border-strong)] bg-[color:var(--color-surface)] px-3 py-2 font-mono-tabular text-sm transition-colors focus:border-[color:var(--color-accent)]/60 focus:outline-none"
        >
          {TIMEZONE_OPTIONS.map((tz) => (
            <option key={tz.offsetMinutes} value={tz.offsetMinutes}>{tz.label}</option>
          ))}
        </select>
        <span className="text-xs text-[color:var(--color-text-muted)]">
          Right now: <span className="font-mono-tabular text-[color:var(--color-text)]">{formatTimestamp(now, offsetMinutes)}</span>
        </span>
      </div>
    </Section>
  )
}
