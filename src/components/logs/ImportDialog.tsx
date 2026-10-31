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

  const hasProgress = Object.keys(progress).length > 0

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#04060d]/70 p-4 backdrop-blur-sm">
      <div className="panel rise-in w-full max-w-lg overflow-hidden">
        <div className="flex items-start justify-between gap-4 border-b border-[color:var(--color-border)]/70 px-5 py-4">
          <div>
            <div className="mb-1 flex items-center gap-2">
              <span className="eyebrow">Ingest</span>
              <span className="accent-rule w-6 opacity-70" />
            </div>
            <h2 className="display text-base font-bold leading-tight">Import Log Files</h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Close import dialog"
            className="rounded-lg p-1.5 text-[color:var(--color-text-muted)] transition-colors hover:bg-[color:var(--color-surface-hover)] hover:text-[color:var(--color-text)]"
          >
            <X size={18} />
          </button>
        </div>

        <div className="max-h-[65vh] space-y-3 overflow-y-auto p-5">
          {!hasProgress && (
            <div
              onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault()
                setDragging(false)
                handleFiles(e.dataTransfer.files)
              }}
              onClick={() => inputRef.current?.click()}
              className={`group relative flex cursor-pointer flex-col items-center justify-center gap-3 overflow-hidden rounded-xl border-2 border-dashed px-6 py-12 text-center transition-all ${
                dragging
                  ? 'border-[color:var(--color-accent)] bg-[color:var(--color-accent)]/10 shadow-[0_0_0_4px_color-mix(in_oklab,var(--color-accent)_12%,transparent)]'
                  : 'border-[color:var(--color-border-strong)] hover:border-[color:var(--color-accent)]/60 hover:bg-[color:var(--color-surface)]/50'
              }`}
            >
              <span className="logo-mark !h-12 !w-12 !rounded-2xl">
                <UploadCloud size={22} />
              </span>
              <div>
                <p className="text-sm font-semibold text-[color:var(--color-text)]">Drop your log files here</p>
                <p className="mt-1 text-xs text-[color:var(--color-text-faint)]">Logs stay in your browser — nothing is uploaded.</p>
              </div>
              <Button variant="secondary" size="sm" onClick={(e) => { e.stopPropagation(); inputRef.current?.click() }}>
                Browse Files
              </Button>
              <p className="mt-1 text-[10px] uppercase tracking-[0.16em] text-[color:var(--color-text-faint)]">
                LOG · TXT · CSV · JSON · JSONL
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
            <div
              key={name}
              className={`panel-soft p-3.5 transition-colors ${
                p.error
                  ? 'border-[color:var(--color-critical)]/40'
                  : p.done
                    ? 'border-[color:var(--color-benign)]/30'
                    : ''
              }`}
            >
              <div className="mb-2.5 flex items-center gap-2">
                <span
                  className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${
                    p.error
                      ? 'bg-[color:var(--color-critical)]/15 text-[color:var(--color-critical)]'
                      : p.done
                        ? 'bg-[color:var(--color-benign)]/15 text-[color:var(--color-benign)]'
                        : 'bg-[color:var(--color-accent)]/15 text-[color:var(--color-accent-strong)]'
                  }`}
                >
                  {p.done ? <CheckCircle2 size={14} /> : <FileText size={14} />}
                </span>
                <span className="truncate font-mono-tabular text-xs font-medium">{name}</span>
              </div>

              {p.error ? (
                <p className="text-xs text-[color:var(--color-critical)]">{p.error}</p>
              ) : !p.done ? (
                <div className="space-y-2">
                  <ProgressRow label="Parsing" percent={p.parsePercent} />
                  <ProgressRow label="Saving" percent={p.savePercent} />
                  <p className="font-mono-tabular text-[10px] text-[color:var(--color-text-faint)]">
                    Events saved: {p.events.toLocaleString()}
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 font-mono-tabular text-xs text-[color:var(--color-text-muted)]">
                  <span className="text-[color:var(--color-text-faint)]">Events</span>
                  <span className="text-right text-[color:var(--color-text)]">{p.totalEvents?.toLocaleString()}</span>
                  <span className="text-[color:var(--color-text-faint)]">Parser</span>
                  <span className="text-right text-[color:var(--color-text)]">{p.parser}</span>
                  <span className="text-[color:var(--color-text-faint)]">Time</span>
                  <span className="text-right text-[color:var(--color-text)]">{formatDuration(p.processingTimeMs ?? 0)}</span>
                  {p.timings && (
                    <>
                      <span className="text-[color:var(--color-text-faint)]">Breakdown</span>
                      <span className="text-right text-[color:var(--color-text)]">
                        parse {formatDuration(p.timings.parseMs)} · db {formatDuration(p.timings.saveMs)}
                      </span>
                    </>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-[color:var(--color-border)]/70 px-5 py-3.5">
          <p className="text-[11px] text-[color:var(--color-text-faint)]">
            {importing ? 'Importing… keep this tab open.' : hasProgress ? 'Import complete.' : 'Parsing runs in a background worker.'}
          </p>
          <Button variant="secondary" size="sm" onClick={onClose} disabled={importing}>
            {hasProgress && !importing ? 'Done' : 'Close'}
          </Button>
        </div>
      </div>
    </div>
  )
}

function ProgressRow({ label, percent }: { label: string; percent: number }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="w-14 text-[10px] uppercase tracking-wide text-[color:var(--color-text-faint)]">{label}</span>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[color:var(--color-surface)]">
        <div
          className="h-full rounded-full bg-[image:var(--accent-gradient)] transition-all"
          style={{ width: `${percent}%` }}
        />
      </div>
      <span className="w-8 text-right font-mono-tabular text-[10px] text-[color:var(--color-text-faint)]">{percent}%</span>
    </div>
  )
}
