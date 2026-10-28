import { useState } from 'react'
import { Tag as TagIcon, StickyNote, FolderPlus, X } from 'lucide-react'
import { Button } from '../ui/Button'
import { MARK_OPTIONS } from '../ui/Badge'
import { bulkSetMark, addTagToLog } from '../../services/logService'
import { db } from '../../db/database'
import { useLiveQuery } from '../../hooks/useLiveQuery'
import type { Tag, Investigation } from '../../types'

export function BulkActionToolbar({
  selectedIds,
  onClear,
}: {
  selectedIds: number[]
  onClear: () => void
}) {
  const [showTags, setShowTags] = useState(false)
  const [showNote, setShowNote] = useState(false)
  const [showInv, setShowInv] = useState(false)
  const [noteText, setNoteText] = useState('')
  const allTags = useLiveQuery(() => db.tags.toArray(), [], [] as Tag[])
  const investigations = useLiveQuery(() => db.investigations.toArray(), [], [] as Investigation[])

  const applyMark = async (mark: (typeof MARK_OPTIONS)[number]['value']) => {
    await bulkSetMark(selectedIds, mark)
    onClear()
  }

  const applyTag = async (tagId: number) => {
    await Promise.all(selectedIds.map((id) => addTagToLog(id, tagId)))
    setShowTags(false)
    onClear()
  }

  const applyNote = async () => {
    if (!noteText.trim()) return
    await db.notes.bulkAdd(selectedIds.map((logId) => ({ logId, text: noteText.trim(), createdAt: Date.now() })))
    setNoteText('')
    setShowNote(false)
    onClear()
  }

  const applyInvestigation = async (invId: number) => {
    await db.investigationLogs.bulkAdd(selectedIds.map((logId) => ({ investigationId: invId, logId, addedAt: Date.now() })))
    setShowInv(false)
    onClear()
  }

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 rounded-full border border-[color:var(--color-border-strong)] bg-[color:var(--color-bg-raised)] px-4 py-2.5 shadow-2xl">
      <span className="text-xs font-semibold text-[color:var(--color-accent-strong)]">{selectedIds.length} selected</span>

      <div className="h-4 w-px bg-[color:var(--color-border-strong)]" />

      <Button variant="ghost" size="sm" onClick={() => applyMark('SUSPICIOUS')}>🟠 Suspicious</Button>
      <Button variant="ghost" size="sm" onClick={() => applyMark('BENIGN')}>🟢 Benign</Button>

      <div className="relative">
        <Button variant="ghost" size="sm" onClick={() => { setShowTags((v) => !v); setShowNote(false); setShowInv(false) }}>
          <TagIcon size={14} /> Add Tag
        </Button>
        {showTags && (
          <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 w-48 rounded-lg border border-[color:var(--color-border-strong)] bg-[color:var(--color-surface)] p-2 flex flex-wrap gap-1.5 shadow-xl">
            {allTags.map((t) => (
              <button
                key={t.id}
                onClick={() => applyTag(t.id!)}
                className="rounded-full border px-2 py-0.5 text-[10px]"
                style={{ borderColor: t.color, color: t.color }}
              >
                {t.name}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="relative">
        <Button variant="ghost" size="sm" onClick={() => { setShowNote((v) => !v); setShowTags(false); setShowInv(false) }}>
          <StickyNote size={14} /> Add Note
        </Button>
        {showNote && (
          <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 w-64 rounded-lg border border-[color:var(--color-border-strong)] bg-[color:var(--color-surface)] p-2.5 shadow-xl">
            <textarea
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              rows={2}
              placeholder="Note for selected events…"
              className="w-full rounded-md border border-[color:var(--color-border-strong)] bg-[color:var(--color-bg)] px-2 py-1.5 text-xs resize-none mb-2"
            />
            <Button variant="primary" size="sm" onClick={applyNote}>Save</Button>
          </div>
        )}
      </div>

      <div className="relative">
        <Button variant="ghost" size="sm" onClick={() => { setShowInv((v) => !v); setShowTags(false); setShowNote(false) }}>
          <FolderPlus size={14} /> Investigation
        </Button>
        {showInv && (
          <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 w-56 rounded-lg border border-[color:var(--color-border-strong)] bg-[color:var(--color-surface)] p-2 shadow-xl">
            {investigations.length === 0 && <p className="text-[10px] text-[color:var(--color-text-faint)] p-1.5">No investigations yet.</p>}
            {investigations.map((inv) => (
              <button
                key={inv.id}
                onClick={() => applyInvestigation(inv.id!)}
                className="w-full text-left px-2 py-1.5 rounded text-xs hover:bg-[color:var(--color-surface-hover)]"
              >
                {inv.code} — {inv.title}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="h-4 w-px bg-[color:var(--color-border-strong)]" />

      <button onClick={onClear} className="text-[color:var(--color-text-muted)] hover:text-[color:var(--color-text)]">
        <X size={16} />
      </button>
    </div>
  )
}
