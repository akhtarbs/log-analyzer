import { useEffect, useState } from 'react'
import { X, Copy, Check, Pencil, Trash2 } from 'lucide-react'
import type { LogEvent, MarkType, Tag, Investigation } from '../../types'
import { SeverityBadge, MARK_OPTIONS } from '../ui/Badge'
import { formatTimestamp } from '../../utils/format'
import { setMark, addTagToLog, removeTagFromLog, getTagsForLog } from '../../services/logService'
import { db } from '../../db/database'
import { Button } from '../ui/Button'
import { useLiveQuery } from '../../hooks/useLiveQuery'
import { useTimezone } from '../../hooks/useTimezone'

export function LogDetailDrawer({
  log,
  onClose,
  onChanged,
}: {
  log: LogEvent
  onClose: () => void
  /** Called whenever this drawer mutates data (mark/tag/note/investigation), so the
   *  parent Log Explorer table — which holds its own non-live snapshot of rows —
   *  knows to re-query and reflect the change. */
  onChanged?: () => void
}) {
  const [copied, setCopied] = useState(false)
  const { offsetMinutes, label: tzLabel } = useTimezone()
  const [note, setNote] = useState('')
  const [currentMark, setCurrentMark] = useState<MarkType>(log.mark)
  const allTags = useLiveQuery(() => db.tags.toArray(), [], [] as Tag[])
  const [logTags, setLogTags] = useState<Tag[]>([])
  const notes = useLiveQuery(() => db.notes.where('logId').equals(log.id!).toArray(), [log.id], [])
  const investigations = useLiveQuery(() => db.investigations.toArray(), [], [] as Investigation[])
  const [selectedInv, setSelectedInv] = useState<string>('')
  const [addedToInv, setAddedToInv] = useState(false)
  const [editingNoteId, setEditingNoteId] = useState<number | null>(null)
  const [editingText, setEditingText] = useState('')

  useEffect(() => {
    getTagsForLog(log.id!).then(setLogTags)
    setCurrentMark(log.mark)
  }, [log.id, log.mark])

  const toggleTag = async (tag: Tag) => {
    const has = logTags.some((t) => t.id === tag.id)
    if (has) {
      await removeTagFromLog(log.id!, tag.id!)
      setLogTags((prev) => prev.filter((t) => t.id !== tag.id))
    } else {
      await addTagToLog(log.id!, tag.id!)
      setLogTags((prev) => [...prev, tag])
    }
    onChanged?.()
  }

  const handleMark = async (mark: (typeof MARK_OPTIONS)[number]['value']) => {
    const next = currentMark === mark ? null : mark
    setCurrentMark(next) // optimistic update so the button highlights immediately
    await setMark(log.id!, next)
    onChanged?.()
  }

  const handleCopy = () => {
    navigator.clipboard.writeText(log.rawLog)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const handleAddNote = async () => {
    if (!note.trim()) return
    await db.notes.add({ logId: log.id!, text: note.trim(), createdAt: Date.now() })
    setNote('')
  }

  const startEditNote = (noteId: number, text: string) => {
    setEditingNoteId(noteId)
    setEditingText(text)
  }

  const saveEditNote = async () => {
    if (editingNoteId === null) return
    if (editingText.trim()) {
      await db.notes.update(editingNoteId, { text: editingText.trim() })
    }
    setEditingNoteId(null)
    setEditingText('')
  }

  const deleteNote = async (noteId: number) => {
    await db.notes.delete(noteId)
    if (editingNoteId === noteId) setEditingNoteId(null)
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative h-full w-full max-w-md overflow-y-auto border-l border-[color:var(--color-border-strong)] bg-[color:var(--color-bg-raised)]/95 shadow-2xl backdrop-blur-xl">
        <div className="glass-bar sticky top-0 z-10 flex items-center justify-between border-b px-5 py-4">
          <div>
            <p className="eyebrow">Event detail</p>
            <h2 className="display text-sm font-semibold text-[color:var(--color-text)]">Log inspection</h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-[color:var(--color-text-muted)] transition-colors hover:bg-[color:var(--color-surface-hover)] hover:text-[color:var(--color-text)]"
            aria-label="Close detail"
          >
            <X size={18} />
          </button>
        </div>

        <div className="space-y-5 p-5 text-sm">
          <div className="panel-soft grid grid-cols-2 gap-3 p-3.5">
            <Field label={`Timestamp (${tzLabel})`} value={formatTimestamp(log.timestamp, offsetMinutes)} mono />
            <Field label="Severity" value={<SeverityBadge severity={log.severity} />} />
          </div>
          <Field label="Event" value={log.eventType ?? '—'} />
          <Field label="Source" value={`${log.srcIp ?? '—'}${log.srcPort ? ':' + log.srcPort : ''}`} mono />
          <Field label="Destination" value={`${log.dstIp ?? '—'}${log.dstPort ? ':' + log.dstPort : ''}`} mono />
          <Field label="Username" value={log.username ?? '—'} />
          <Field label="Hostname" value={log.hostname ?? '—'} />
          {log.url && <Field label="URL / Path" value={log.url} mono />}
          {log.httpVersion && <Field label="HTTP Version" value={log.httpVersion} mono />}
          {log.userAgent && <Field label="User Agent / Browser" value={log.userAgent} />}
          {log.referer && <Field label="Referer" value={log.referer} mono />}
          {log.requestBody && <Field label="Request Body / Data Sent" value={<pre className="whitespace-pre-wrap break-all text-xs">{log.requestBody}</pre>} />}
          <Field label="Message" value={log.message ?? '—'} />

          <div>
            <p className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-[color:var(--color-text-faint)]">Raw log</p>
            <div className="relative rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)]/70 p-3">
              <pre className="whitespace-pre-wrap break-all font-mono-tabular text-[11px] text-[color:var(--color-text)]">{log.rawLog}</pre>
              <button
                onClick={handleCopy}
                className="absolute right-2 top-2 rounded-md bg-[color:var(--color-surface)] p-1.5 text-[color:var(--color-text-muted)] transition-colors hover:text-[color:var(--color-text)]"
                aria-label="Copy raw log"
              >
                {copied ? <Check size={13} /> : <Copy size={13} />}
              </button>
            </div>
          </div>

          <div>
            <p className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-[color:var(--color-text-faint)]">Mark</p>
            <div className="flex flex-wrap gap-1.5">
              {MARK_OPTIONS.map((m) => (
                <button
                  key={m.value}
                  onClick={() => handleMark(m.value)}
                  className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-xs transition-colors ${
                    currentMark === m.value
                      ? 'bg-[color:var(--color-accent)]/15 text-[color:var(--color-accent-strong)] shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--color-accent)_45%,transparent)]'
                      : 'text-[color:var(--color-text-muted)] shadow-[inset_0_0_0_1px_var(--color-border-strong)] hover:bg-[color:var(--color-surface-hover)]'
                  }`}
                >
                  <span>{m.icon}</span> {m.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-[color:var(--color-text-faint)]">Tags</p>
            <div className="flex flex-wrap gap-1.5">
              {allTags.map((tag) => {
                const active = logTags.some((t) => t.id === tag.id)
                return (
                  <button
                    key={tag.id}
                    onClick={() => toggleTag(tag)}
                    className="rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors"
                    style={{
                      borderColor: active ? tag.color : 'var(--color-border-strong)',
                      backgroundColor: active ? `${tag.color}22` : 'transparent',
                      color: active ? tag.color : 'var(--color-text-muted)',
                    }}
                  >
                    {tag.name}
                  </button>
                )
              })}
            </div>
          </div>

          <div>
            <p className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-[color:var(--color-text-faint)]">Analyst note</p>
            <div className="space-y-2 mb-2">
              {notes.map((n) => (
                <div key={n.id} className="group rounded-md bg-[color:var(--color-surface)] p-2.5 text-xs">
                  {editingNoteId === n.id ? (
                    <div className="space-y-1.5">
                      <textarea
                        value={editingText}
                        onChange={(e) => setEditingText(e.target.value)}
                        rows={2}
                        autoFocus
                        className="w-full rounded-md border border-[color:var(--color-border-strong)] bg-[color:var(--color-bg)] px-2 py-1.5 text-xs resize-none"
                      />
                      <div className="flex gap-1.5">
                        <Button variant="primary" size="sm" onClick={saveEditNote}>Save</Button>
                        <Button variant="ghost" size="sm" onClick={() => setEditingNoteId(null)}>Cancel</Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-[color:var(--color-text)] whitespace-pre-wrap break-words">{n.text}</p>
                        <p className="text-[10px] text-[color:var(--color-text-faint)] mt-1 font-mono-tabular">{formatTimestamp(n.createdAt, offsetMinutes)}</p>
                      </div>
                      <div className="flex gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => startEditNote(n.id!, n.text)}
                          className="rounded p-1 text-[color:var(--color-text-faint)] hover:text-[color:var(--color-accent)] hover:bg-[color:var(--color-surface-hover)]"
                          aria-label="Edit note"
                        >
                          <Pencil size={12} />
                        </button>
                        <button
                          onClick={() => deleteNote(n.id!)}
                          className="rounded p-1 text-[color:var(--color-text-faint)] hover:text-[color:var(--color-critical)] hover:bg-[color:var(--color-surface-hover)]"
                          aria-label="Delete note"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Add analyst note…"
              rows={3}
              className="w-full rounded-md border border-[color:var(--color-border-strong)] bg-[color:var(--color-surface)] px-2.5 py-2 text-xs resize-none"
            />
            <Button variant="secondary" size="sm" className="mt-2" onClick={handleAddNote}>Save Note</Button>
          </div>

          <div>
            <p className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-[color:var(--color-text-faint)]">Add to investigation</p>
            <div className="flex gap-2">
              <select
                value={selectedInv}
                onChange={(e) => setSelectedInv(e.target.value)}
                className="flex-1 rounded-md border border-[color:var(--color-border-strong)] bg-[color:var(--color-surface)] px-2 py-1.5 text-xs"
              >
                <option value="">Select investigation…</option>
                {investigations.map((inv) => (
                  <option key={inv.id} value={inv.id}>{inv.code} — {inv.title}</option>
                ))}
              </select>
              <Button
                variant="secondary"
                size="sm"
                disabled={!selectedInv}
                onClick={async () => {
                  await db.investigationLogs.add({ investigationId: Number(selectedInv), logId: log.id!, addedAt: Date.now() })
                  setAddedToInv(true)
                  setTimeout(() => setAddedToInv(false), 1500)
                }}
              >
                {addedToInv ? <Check size={14} /> : 'Add'}
              </Button>
            </div>
            {investigations.length === 0 && (
              <p className="text-[10px] text-[color:var(--color-text-faint)] mt-1">No investigations yet — create one on the Investigations page.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function Field({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <p className="mb-0.5 truncate text-[10px] font-bold uppercase tracking-[0.12em] text-[color:var(--color-text-faint)]">{label}</p>
      <div className={mono ? 'break-all font-mono-tabular text-[color:var(--color-text)]' : 'break-words text-[color:var(--color-text)]'}>{value}</div>
    </div>
  )
}
