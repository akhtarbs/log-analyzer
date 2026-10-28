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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-2xl max-h-[80vh] flex flex-col rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-bg-raised)] shadow-2xl">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-[color:var(--color-border)]">
          <div>
            <h2 className="text-sm font-semibold">Uploaded Log Files</h2>
            <p className="text-[11px] text-[color:var(--color-text-muted)] mt-0.5">
              {activeCount} of {files.length} included in analysis
            </p>
          </div>
          <button onClick={onClose} className="text-[color:var(--color-text-muted)] hover:text-[color:var(--color-text)]">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {files.length === 0 && (
            <p className="text-xs text-[color:var(--color-text-faint)] text-center py-8">No log files imported yet.</p>
          )}
          {files.map((file) => (
            <div
              key={file.id}
              className={`flex items-center justify-between rounded-lg border p-3 transition-colors ${
                file.active
                  ? 'border-[color:var(--color-border)] bg-[color:var(--color-surface)]'
                  : 'border-[color:var(--color-border)]/60 bg-[color:var(--color-surface)]/40 opacity-60'
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <FileText size={16} className="text-[color:var(--color-text-muted)] shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{file.name}</p>
                  <p className="text-[10px] text-[color:var(--color-text-faint)] font-mono-tabular mt-0.5">
                    {formatNumber(file.eventCount)} events · {file.parser} · {formatBytes(file.size)}
                    {file.processingTimeMs > 0 && ` · ${formatDuration(file.processingTimeMs)}`}
                  </p>
                  <p className="text-[10px] text-[color:var(--color-text-faint)] font-mono-tabular">{formatTimestamp(file.importedAt, offsetMinutes)}</p>
                </div>
              </div>

              <div className="flex items-center gap-3 shrink-0">
                <span
                  className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded ${
                    file.active
                      ? 'text-[color:var(--color-benign)] bg-[color:var(--color-benign)]/12'
                      : 'text-[color:var(--color-text-faint)] bg-[color:var(--color-surface-hover)]'
                  }`}
                >
                  {file.active ? 'Included' : 'Excluded'}
                </span>

                <button
                  onClick={() => toggle(file)}
                  title={file.active ? 'Exclude from analysis' : 'Include in analysis'}
                  className="rounded-md p-1.5 text-[color:var(--color-text-muted)] hover:bg-[color:var(--color-surface-hover)] hover:text-[color:var(--color-text)]"
                >
                  {file.active ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>

                <button
                  onClick={() => setPendingDelete(file)}
                  title="Delete file and its events"
                  className="rounded-md p-1.5 text-[color:var(--color-text-faint)] hover:bg-[color:var(--color-critical)]/10 hover:text-[color:var(--color-critical)]"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="px-5 py-3 border-t border-[color:var(--color-border)] text-[11px] text-[color:var(--color-text-faint)]">
          Excluded files stay in local storage but their events are hidden from the dashboard, analysis, and detection rules until re-included.
        </div>
      </div>

      {pendingDelete && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-sm rounded-xl border border-[color:var(--color-critical)]/40 bg-[color:var(--color-bg-raised)] p-5">
            <div className="flex items-center gap-2 mb-2 text-[color:var(--color-critical)]">
              <AlertTriangle size={18} />
              <p className="text-sm font-semibold">Delete "{pendingDelete.name}"?</p>
            </div>
            <p className="text-xs text-[color:var(--color-text-muted)] mb-4">
              This permanently removes {formatNumber(pendingDelete.eventCount)} events and any marks, tags, or notes attached to them. This action cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" size="sm" onClick={() => setPendingDelete(null)} disabled={busy}>Cancel</Button>
              <Button variant="danger" size="sm" onClick={confirmDelete} disabled={busy}>{busy ? 'Deleting…' : 'Delete'}</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
