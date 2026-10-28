import { useCallback, useRef, useState } from 'react'
import { UploadCloud, X, FileText, CheckCircle2 } from 'lucide-react'
import { Button } from '../ui/Button'
import { importFiles, type ImportProgress, type ImportTimings } from '../../services/importService'
import { isCancelled } from '../../services/progress'
import { formatDuration } from '../../utils/format'

const ACCEPTED = ['.log', '.txt', '.csv', '.json', '.jsonl']

interface FileProgressState {
  [name: string]: ImportProgress & {
    done?: boolean
    totalEvents?: number
    processingTimeMs?: number
    parser?: string
    timings?: ImportTimings
    error?: string
  }
}

export function ImportDialog({ onClose, onImported }: { onClose: () => void; onImported: () => void }) {
  const [dragging, setDragging] = useState(false)
  const [progress, setProgress] = useState<FileProgressState>({})
  const [importing, setImporting] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFiles = useCallback(async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return
    const files = Array.from(fileList)
    setImporting(true)
    setProgress(
      Object.fromEntries(
        files.map((f) => [f.name, { fileName: f.name, phase: 'reading', parsePercent: 0, savePercent: 0, events: 0 }]),
      ),
    )

    const outcomes = await importFiles(files, (fileName, p) => {
      setProgress((prev) => ({ ...prev, [fileName]: { ...prev[fileName], ...p, done: p.phase === 'done' } }))
    })

    outcomes.forEach((o) => {
      setProgress((prev) => ({
        ...prev,
        [o.file.name]:
          'result' in o
            ? {
                ...prev[o.file.name],
                done: true,
                totalEvents: o.result.totalEvents,
                processingTimeMs: o.result.processingTimeMs,
                parser: o.result.parser,
                timings: o.result.timings,
              }
            : {
                ...prev[o.file.name],
                error: isCancelled(o.error) ? 'Import cancelled' : o.error instanceof Error ? o.error.message : 'Import failed',
              },
      }))
    })

    setImporting(false)
    onImported()
  }, [onImported])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-lg rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-bg-raised)] shadow-2xl">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-[color:var(--color-border)]">
          <h2 className="text-sm font-semibold">Import Log</h2>
          <button onClick={onClose} className="text-[color:var(--color-text-muted)] hover:text-[color:var(--color-text)]">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {Object.keys(progress).length === 0 && (
            <div
              onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault()
                setDragging(false)
                handleFiles(e.dataTransfer.files)
              }}
              onClick={() => inputRef.current?.click()}
              className={`flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed py-12 cursor-pointer transition-colors ${
                dragging ? 'border-[color:var(--color-accent)] bg-[color:var(--color-accent)]/5' : 'border-[color:var(--color-border-strong)]'
              }`}
            >
              <UploadCloud size={28} className="text-[color:var(--color-text-muted)]" />
              <p className="text-sm text-[color:var(--color-text)]">Drop your log files here</p>
              <p className="text-xs text-[color:var(--color-text-faint)]">or</p>
              <Button variant="secondary" size="sm" onClick={(e) => { e.stopPropagation(); inputRef.current?.click() }}>
                Browse Files
              </Button>
              <p className="text-[10px] uppercase tracking-wide text-[color:var(--color-text-faint)] mt-2">
                Supported: LOG TXT CSV JSON JSONL
              </p>
              <input
                ref={inputRef}
                type="file"
                multiple
                accept={ACCEPTED.join(',')}
                className="hidden"
                onChange={(e) => handleFiles(e.target.files)}
              />
            </div>
          )}

          {Object.entries(progress).map(([name, p]) => (
            <div key={name} className="rounded-lg border border-[color:var(--color-border)] p-3">
              <div className="flex items-center gap-2 mb-2">
                {p.done ? (
                  <CheckCircle2 size={14} className="text-[color:var(--color-benign)]" />
                ) : (
                  <FileText size={14} className="text-[color:var(--color-text-muted)]" />
                )}
                <span className="text-xs font-medium truncate">{name}</span>
              </div>

              {p.error ? (
                <p className="text-xs text-[color:var(--color-critical)]">{p.error}</p>
              ) : !p.done ? (
                <div className="space-y-1.5">
                  <ProgressRow label="Parsing" percent={p.parsePercent} />
                  <ProgressRow label="Saving" percent={p.savePercent} />
                  <p className="text-[10px] text-[color:var(--color-text-faint)] font-mono-tabular">Events saved: {p.events.toLocaleString()}</p>
                </div>
              ) : (
                <div className="text-xs text-[color:var(--color-text-muted)] grid grid-cols-2 gap-x-4 gap-y-1 font-mono-tabular">
                  <span>Events</span><span className="text-[color:var(--color-text)]">{p.totalEvents?.toLocaleString()}</span>
                  <span>Parser</span><span className="text-[color:var(--color-text)]">{p.parser}</span>
                  <span>Time</span><span className="text-[color:var(--color-text)]">{formatDuration(p.processingTimeMs ?? 0)}</span>
                  {p.timings && (
                    <>
                      <span>Breakdown</span>
                      <span className="text-[color:var(--color-text)]">
                        parse {formatDuration(p.timings.parseMs)} · database {formatDuration(p.timings.saveMs)}
                      </span>
                    </>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="flex justify-end gap-2 px-5 py-3.5 border-t border-[color:var(--color-border)]">
          <Button variant="secondary" size="sm" onClick={onClose} disabled={importing}>
            {Object.keys(progress).length > 0 && !importing ? 'Done' : 'Close'}
          </Button>
        </div>
      </div>
    </div>
  )
}

function ProgressRow({ label, percent }: { label: string; percent: number }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-14 text-[10px] uppercase text-[color:var(--color-text-faint)]">{label}</span>
      <div className="flex-1 h-1.5 rounded-full bg-[color:var(--color-surface)] overflow-hidden">
        <div className="h-full bg-[color:var(--color-accent)] transition-all" style={{ width: `${percent}%` }} />
      </div>
      <span className="w-8 text-right text-[10px] font-mono-tabular text-[color:var(--color-text-faint)]">{percent}%</span>
    </div>
  )
}
