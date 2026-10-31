import { useState } from 'react'
import { X, Trash2, FileText, EyeOff, Eye, AlertTriangle } from 'lucide-react'
import { useLiveQuery } from '../../hooks/useLiveQuery'
import { listLogFiles, setFileActive, deleteLogFile } from '../../services/fileService'
import { startTask } from '../../services/progress'
import type { LogFile } from '../../types'
import { formatBytes, formatDuration, formatNumber, formatTimestamp } from '../../utils/format'
import { useTimezone } from '../../hooks/useTimezone'
import { Button } from '../ui/Button'

export function LogFilesPanel({ onClose, onChanged }: { onClose: () => void; onChanged: () => void }) {
  const files = useLiveQuery(() => listLogFiles(), [], [] as LogFile[])
  const [pendingDelete, setPendingDelete] = useState<LogFile | null>(null)
  const [busy, setBusy] = useState(false)
  const { offsetMinutes } = useTimezone()

  const toggle = async (file: LogFile) => {
    await setFileActive(file.id!, !file.active)
    onChanged()
  }

  const confirmDelete = async () => {
    if (!pendingDelete) return
    setBusy(true)
    const task = startTask(`Deleting ${pendingDelete.name}`)
    try {
      await deleteLogFile(pendingDelete.id!, task)
    } finally {
      task.finish()
    }
    setBusy(false)
    setPendingDelete(null)
    onChanged()
  }

  const activeCount = files.filter((f) => f.active).length
  const totalEvents = files.reduce((sum, f) => sum + f.eventCount, 0)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#04060d]/70 p-4 backdrop-blur-sm">
      <div className="panel rise-in flex max-h-[82vh] w-full max-w-2xl flex-col overflow-hidden">
        <div className="flex items-start justify-between gap-4 border-b border-[color:var(--color-border)]/70 px-5 py-4">
          <div>
            <div className="mb-1 flex items-center gap-2">
              <span className="eyebrow">Corpus</span>
              <span className="accent-rule w-6 opacity-70" />
            </div>
            <h2 className="display text-base font-bold leading-tight">Uploaded Log Files</h2>
            <p className="mt-1 text-[11px] text-[color:var(--color-text-muted)]">
              <span className="font-semibold text-[color:var(--color-benign)]">{activeCount}</span> of {files.length} included ·{' '}
              {formatNumber(totalEvents)} events
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close log files panel"
            className="rounded-lg p-1.5 text-[color:var(--color-text-muted)] transition-colors hover:bg-[color:var(--color-surface-hover)] hover:text-[color:var(--color-text)]"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 space-y-2 overflow-y-auto p-4">
          {files.length === 0 && (
            <div className="py-12 text-center">
              <p className="text-sm text-[color:var(--color-text-muted)]">No log files imported yet.</p>
              <p className="mt-1 text-xs text-[color:var(--color-text-faint)]">Import a log file to start building a corpus.</p>
            </div>
          )}
          {files.map((file) => (
            <div
              key={file.id}
              className={`panel-soft relative flex items-center justify-between gap-4 overflow-hidden p-3.5 transition-all ${
                file.active ? '' : 'opacity-55'
              }`}
            >
              <span
                aria-hidden
                className="absolute inset-y-0 left-0 w-[3px]"
                style={{ background: file.active ? 'var(--accent-gradient)' : 'var(--color-border-strong)' }}
              />
              <div className="flex min-w-0 items-center gap-3 pl-1">
                <span className="icon-tile !h-8 !w-8 !rounded-lg">
                  <FileText size={15} />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{file.name}</p>
                  <p className="mt-0.5 truncate font-mono-tabular text-[10px] text-[color:var(--color-text-faint)]">
                    {formatNumber(file.eventCount)} events · {file.parser} · {formatBytes(file.size)}
                    {file.processingTimeMs > 0 && ` · ${formatDuration(file.processingTimeMs)}`}
                  </p>
                  <p className="font-mono-tabular text-[10px] text-[color:var(--color-text-faint)]">
                    {formatTimestamp(file.importedAt, offsetMinutes)}
                  </p>
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-1.5">
                <span
                  className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                  style={{
                    color: file.active ? 'var(--color-benign)' : 'var(--color-text-faint)',
                    background: `color-mix(in oklab, ${file.active ? 'var(--color-benign)' : 'var(--color-text-faint)'} 12%, transparent)`,
                    boxShadow: `inset 0 0 0 1px color-mix(in oklab, ${file.active ? 'var(--color-benign)' : 'var(--color-text-faint)'} 26%, transparent)`,
                  }}
                >
                  {file.active ? 'Included' : 'Excluded'}
                </span>

                <button
                  onClick={() => toggle(file)}
                  title={file.active ? 'Exclude from analysis' : 'Include in analysis'}
                  aria-label={file.active ? 'Exclude from analysis' : 'Include in analysis'}
                  className="rounded-lg p-1.5 text-[color:var(--color-text-muted)] transition-colors hover:bg-[color:var(--color-surface-hover)] hover:text-[color:var(--color-text)]"
                >
                  {file.active ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>

                <button
                  onClick={() => setPendingDelete(file)}
                  title="Delete file and its events"
                  aria-label="Delete file and its events"
                  className="rounded-lg p-1.5 text-[color:var(--color-text-faint)] transition-colors hover:bg-[color:var(--color-critical)]/12 hover:text-[color:var(--color-critical)]"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="border-t border-[color:var(--color-border)]/70 px-5 py-3 text-[11px] leading-relaxed text-[color:var(--color-text-faint)]">
          Excluded files stay in local storage, but their events are hidden from the dashboard, analysis, and detection rules until re-included.
        </div>
      </div>

      {pendingDelete && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[#04060d]/75 p-4 backdrop-blur-sm">
          <div className="panel rise-in w-full max-w-sm overflow-hidden">
            <div className="border-b border-[color:var(--color-border)]/70 px-5 py-4">
              <div className="flex items-center gap-2 text-[color:var(--color-critical)]">
                <AlertTriangle size={18} />
                <p className="text-sm font-semibold">Delete "{pendingDelete.name}"?</p>
              </div>
            </div>
            <p className="px-5 py-4 text-xs leading-relaxed text-[color:var(--color-text-muted)]">
              This permanently removes {formatNumber(pendingDelete.eventCount)} events and any marks, tags, or notes attached to them. This action cannot be undone.
            </p>
            <div className="flex justify-end gap-2 border-t border-[color:var(--color-border)]/70 px-5 py-3">
              <Button variant="secondary" size="sm" onClick={() => setPendingDelete(null)} disabled={busy}>Cancel</Button>
              <Button variant="danger" size="sm" onClick={confirmDelete} disabled={busy}>{busy ? 'Deleting…' : 'Delete'}</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
