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

  const togglePanel = (panel: 'tags' | 'note' | 'inv') => {
    setShowTags((v) => (panel === 'tags' ? !v : false))
    setShowNote((v) => (panel === 'note' ? !v : false))
    setShowInv((v) => (panel === 'inv' ? !v : false))
  }

  return (
    <div className="glass-bar rise-in fixed bottom-6 left-1/2 z-40 flex max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-2 overflow-x-auto rounded-full border px-3 py-2 shadow-[0_24px_60px_-24px_rgba(0,0,0,0.9)]">
      <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-[image:var(--accent-gradient)] px-2.5 py-1 text-[11px] font-bold text-white shadow-[0_8px_20px_-8px_rgba(109,139,255,0.9)]">
        {selectedIds.length} selected
      </span>

      <span className="h-5 w-px shrink-0 bg-[color:var(--color-border-strong)]" />

      <Button variant="ghost" size="sm" onClick={() => applyMark('SUSPICIOUS')}>
        <span aria-hidden>🟠</span> Suspicious
      </Button>
      <Button variant="ghost" size="sm" onClick={() => applyMark('BENIGN')}>
        <span aria-hidden>🟢</span> Benign
      </Button>

      <span className="h-5 w-px shrink-0 bg-[color:var(--color-border-strong)]" />

      <div className="relative shrink-0">
        <Button variant="ghost" size="sm" onClick={() => togglePanel('tags')}>
          <TagIcon size={14} /> Add Tag
        </Button>
        {showTags && (
          <div className="panel absolute bottom-full left-1/2 mb-2 flex w-52 -translate-x-1/2 flex-wrap gap-1.5 p-2.5">
            {allTags.length === 0 && (
              <p className="px-1 py-1 text-[10px] text-[color:var(--color-text-faint)]">No tags yet.</p>
            )}
            {allTags.map((t) => (
              <button
                key={t.id}
                onClick={() => applyTag(t.id!)}
                className="rounded-full px-2 py-0.5 text-[10px] font-medium transition-transform hover:scale-105"
                style={{
                  border: `1px solid ${t.color}`,
                  color: t.color,
                  background: `color-mix(in oklab, ${t.color} 12%, transparent)`,
                }}
              >
                {t.name}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="relative shrink-0">
        <Button variant="ghost" size="sm" onClick={() => togglePanel('note')}>
          <StickyNote size={14} /> Add Note
        </Button>
        {showNote && (
          <div className="panel absolute bottom-full left-1/2 mb-2 w-64 -translate-x-1/2 p-2.5">
            <textarea
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              rows={2}
              placeholder="Note for selected events…"
              className="panel-soft mb-2 w-full resize-none rounded-lg px-2.5 py-2 text-xs outline-none focus:border-[color:var(--color-accent)]/60"
            />
            <div className="flex justify-end">
              <Button variant="primary" size="sm" onClick={applyNote}>Save</Button>
            </div>
          </div>
        )}
      </div>

      <div className="relative shrink-0">
        <Button variant="ghost" size="sm" onClick={() => togglePanel('inv')}>
          <FolderPlus size={14} /> Investigation
        </Button>
        {showInv && (
          <div className="panel absolute bottom-full left-1/2 mb-2 w-60 -translate-x-1/2 p-1.5">
            {investigations.length === 0 && (
              <p className="p-2 text-[10px] text-[color:var(--color-text-faint)]">No investigations yet.</p>
            )}
            {investigations.map((inv) => (
              <button
                key={inv.id}
                onClick={() => applyInvestigation(inv.id!)}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition-colors hover:bg-[color:var(--color-surface-hover)]"
              >
                <span className="font-mono-tabular text-[10px] text-[color:var(--color-accent-strong)]">{inv.code}</span>
                <span className="truncate">{inv.title}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <span className="h-5 w-px shrink-0 bg-[color:var(--color-border-strong)]" />

      <button
        onClick={onClear}
        aria-label="Clear selection"
        className="shrink-0 rounded-lg p-1.5 text-[color:var(--color-text-muted)] transition-colors hover:bg-[color:var(--color-surface-hover)] hover:text-[color:var(--color-text)]"
      >
        <X size={16} />
      </button>
    </div>
  )
}
