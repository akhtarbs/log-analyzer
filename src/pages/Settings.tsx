import { useEffect, useState } from 'react'
import { Settings as SettingsIcon, Download, Upload, Trash2, HardDrive, AlertTriangle, Files, Clock } from 'lucide-react'
import { useLiveQuery } from '../hooks/useLiveQuery'
import { db } from '../db/database'
import { Button } from '../components/ui/Button'
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

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      <h1 className="text-lg font-bold flex items-center gap-2">
        <SettingsIcon size={18} className="text-[color:var(--color-accent)]" /> Settings
      </h1>

      {/* Timezone */}
      <TimezoneSection />

      {/* Data Management */}
      <section className="rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-bg-raised)] p-5">
        <h2 className="text-sm font-semibold mb-4 flex items-center gap-2"><HardDrive size={15} /> Data Management</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <StatBox label="Events" value={formatNumber(eventCount)} />
          <StatBox label="Log Files" value={formatNumber(fileCount)} />
          <StatBox label="Marked" value={formatNumber(markedCount)} />
          <StatBox label="Investigations" value={formatNumber(invCount)} />
        </div>
        {storageEstimate && (
          <div className="mb-4">
            <p className="text-xs text-[color:var(--color-text-muted)] mb-1.5">
              Local Storage: {formatBytes(storageEstimate.usage)} {storageEstimate.quota > 0 && `of ${formatBytes(storageEstimate.quota)} available`}
            </p>
            {storageEstimate.quota > 0 && (
              <div className="h-1.5 rounded-full bg-[color:var(--color-surface)] overflow-hidden">
                <div className="h-full bg-[color:var(--color-accent)]" style={{ width: `${Math.min(100, (storageEstimate.usage / storageEstimate.quota) * 100)}%` }} />
              </div>
            )}
          </div>
        )}
        <Button variant="danger" size="sm" onClick={() => setConfirmClear(true)}>
          <Trash2 size={14} /> Clear All Data
        </Button>
      </section>

      {/* Log Files */}
      <section className="rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-bg-raised)] p-5">
        <h2 className="text-sm font-semibold mb-2 flex items-center gap-2"><Files size={15} /> Log Files</h2>
        <p className="text-xs text-[color:var(--color-text-muted)] mb-3">
          View every imported file, and choose which ones are included in analysis. Excluded files stay in storage but are hidden from the dashboard, analysis, and detection rules.
        </p>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="secondary" size="sm" onClick={() => setShowFilesPanel(true)}>
            <Files size={14} /> Manage Log Files
          </Button>
          <Button variant="secondary" size="sm" onClick={handleRebuildStats} disabled={busy}>
            Rebuild statistics
          </Button>
        </div>
        <p className="text-[11px] text-[color:var(--color-text-faint)] mt-2">
          Dashboard and Analysis read pre-computed per-file statistics, which are built when a file is imported. Rebuild only if numbers ever look wrong.
        </p>
        {statsMessage && <p className="text-xs text-[color:var(--color-text-muted)] mt-1">{statsMessage}</p>}
      </section>

      {/* Backup */}
      <section className="rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-bg-raised)] p-5">
        <h2 className="text-sm font-semibold mb-3">Backup</h2>
        <p className="text-xs text-[color:var(--color-text-muted)] mb-3">
          Exports metadata, marks, tags, investigations, saved filters, detection rules, and settings as a local file. Nothing is sent anywhere.
        </p>
        <label className="flex items-center gap-2 text-xs mb-3">
          <input type="checkbox" checked={includeOriginal} onChange={(e) => setIncludeOriginal(e.target.checked)} className="accent-[color:var(--color-accent)]" />
          Include original log files (creates a .zip)
        </label>
        <Button variant="secondary" size="sm" onClick={handleBackup} disabled={busy}>
          <Download size={14} /> Export Backup
        </Button>
      </section>

      {/* Restore */}
      <section className="rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-bg-raised)] p-5">
        <h2 className="text-sm font-semibold mb-3">Restore</h2>
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
      </section>

      {/* Restore confirm dialog */}
      {restoreConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-sm rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-bg-raised)] p-5">
            <p className="text-sm font-semibold mb-2">Existing data detected.</p>
            <p className="text-xs text-[color:var(--color-text-muted)] mb-4">Choose how to restore <span className="font-mono-tabular">{restoreConfirm.name}</span>.</p>
            <div className="flex gap-2 mb-4">
              {(['merge', 'replace'] as RestoreMode[]).map((m) => (
                <button
                  key={m}
                  onClick={() => setRestoreMode(m)}
                  className={`flex-1 rounded-md px-3 py-2 text-xs font-medium border capitalize ${restoreMode === m ? 'border-[color:var(--color-accent)] bg-[color:var(--color-accent)]/12 text-[color:var(--color-accent-strong)]' : 'border-[color:var(--color-border-strong)] text-[color:var(--color-text-muted)]'}`}
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
      )}

      {/* Clear confirm dialog */}
      {confirmClear && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-sm rounded-xl border border-[color:var(--color-critical)]/40 bg-[color:var(--color-bg-raised)] p-5">
            <div className="flex items-center gap-2 mb-2 text-[color:var(--color-critical)]">
              <AlertTriangle size={18} />
              <p className="text-sm font-semibold">This will permanently delete all local application data.</p>
            </div>
            <p className="text-xs text-[color:var(--color-text-muted)] mb-4">This action cannot be undone.</p>
            <div className="flex justify-end gap-2">
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

function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-[color:var(--color-surface)] p-3">
      <p className="text-[10px] text-[color:var(--color-text-muted)] mb-0.5">{label}</p>
      <p className="text-base font-bold font-mono-tabular">{value}</p>
    </div>
  )
}

function TimezoneSection() {
  const { offsetMinutes, setOffsetMinutes } = useTimezone()
  const now = Date.now()

  return (
    <section className="rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-bg-raised)] p-5">
      <h2 className="text-sm font-semibold mb-2 flex items-center gap-2"><Clock size={15} /> Timezone</h2>
      <p className="text-xs text-[color:var(--color-text-muted)] mb-3">
        Choose the UTC/GMT offset used to display every timestamp in the app — the Log Explorer table, log details, dashboard, analysis, investigations, and the time-range filter. This only changes how times are displayed; the underlying data is always stored and matched in UTC, so nothing needs re-importing.
      </p>
      <div className="flex items-center gap-3 flex-wrap">
        <select
          value={offsetMinutes}
          onChange={(e) => setOffsetMinutes(Number(e.target.value))}
          className="rounded-md border border-[color:var(--color-border-strong)] bg-[color:var(--color-surface)] px-3 py-2 text-sm font-mono-tabular"
        >
          {TIMEZONE_OPTIONS.map((tz) => (
            <option key={tz.offsetMinutes} value={tz.offsetMinutes}>{tz.label}</option>
          ))}
        </select>
        <span className="text-xs text-[color:var(--color-text-muted)]">
          Right now: <span className="font-mono-tabular text-[color:var(--color-text)]">{formatTimestamp(now, offsetMinutes)}</span>
        </span>
      </div>
    </section>
  )
}
