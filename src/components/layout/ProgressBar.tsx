import { useEffect, useState, useSyncExternalStore } from 'react'
import { X } from 'lucide-react'
import { cancelTask, getTasksSnapshot, subscribeTasks, type TaskSnapshot } from '../../services/progress'

// Don't flash UI for work that finishes almost instantly.
const BAR_DELAY_MS = 150
const PANEL_DELAY_MS = 400

function formatElapsed(ms: number): string {
  return ms < 10_000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.round(ms / 1000)}s`
}

export function ProgressBar() {
  const tasks = useSyncExternalStore(subscribeTasks, getTasksSnapshot)
  const [, setTick] = useState(0)

  // Re-render while anything is running so elapsed time and the delay
  // thresholds stay current.
  useEffect(() => {
    if (tasks.length === 0) return
    const t = setInterval(() => setTick((n) => n + 1), 250)
    return () => clearInterval(t)
  }, [tasks.length])

  const now = Date.now()
  const barTasks = tasks.filter((t) => now - t.startedAt >= BAR_DELAY_MS)
  const panelTasks = tasks.filter((t) => now - t.startedAt >= PANEL_DELAY_MS)

  if (barTasks.length === 0) return null

  // The thin top bar follows the oldest running task.
  const lead = barTasks[0]

  return (
    <>
      <div className="pointer-events-none fixed inset-x-0 top-0 z-[80] h-[3px] bg-transparent" aria-hidden>
        {lead.percent === null ? (
          <div className="progress-indeterminate h-full w-1/3 bg-[image:var(--accent-gradient)] shadow-[0_0_12px_0_var(--color-accent)]" />
        ) : (
          <div
            className="h-full bg-[image:var(--accent-gradient)] shadow-[0_0_12px_0_var(--color-accent)] transition-[width] duration-200"
            style={{ width: `${lead.percent}%` }}
          />
        )}
      </div>

      {panelTasks.length > 0 && (
        <div
          className="fixed bottom-4 right-4 z-[80] w-72 space-y-2"
          role="status"
          aria-live="polite"
        >
          {panelTasks.map((t) => (
            <TaskCard key={t.id} task={t} now={now} />
          ))}
        </div>
      )}
    </>
  )
}

function TaskCard({ task, now }: { task: TaskSnapshot; now: number }) {
  return (
    <div className="panel p-3">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium truncate" title={task.label}>{task.label}</p>
        {task.cancellable && !task.cancelling && (
          <button
            onClick={() => cancelTask(task.id)}
            className="shrink-0 rounded p-0.5 text-[color:var(--color-text-faint)] hover:bg-[color:var(--color-surface-hover)] hover:text-[color:var(--color-critical)]"
            aria-label={`Cancel ${task.label}`}
            title="Cancel"
          >
            <X size={14} />
          </button>
        )}
      </div>

      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[color:var(--color-surface)]">
        {task.percent === null ? (
          <div className="progress-indeterminate h-full w-1/3 rounded-full bg-[image:var(--accent-gradient)]" />
        ) : (
          <div
            className="h-full rounded-full bg-[image:var(--accent-gradient)] transition-[width] duration-200"
            style={{ width: `${task.percent}%` }}
          />
        )}
      </div>

      <div className="mt-1.5 flex items-center justify-between text-[10px] text-[color:var(--color-text-faint)] font-mono-tabular">
        <span className="truncate">{task.cancelling ? 'Cancelling…' : task.detail || 'Working…'}</span>
        <span className="shrink-0 ml-2">
          {task.percent !== null && `${Math.round(task.percent)}% · `}
          {formatElapsed(now - task.startedAt)}
        </span>
      </div>
    </div>
  )
}
