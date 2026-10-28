// ---------------------------------------------------------------------------
// Global task/progress store.
//
// Any long-running operation (import, full-table scans, detection rules...)
// registers a task here so the UI can show a progress bar and — where the
// work supports it — let the person cancel. It's a plain external store (not
// React state) so services can start tasks without needing hooks; the UI
// subscribes through useSyncExternalStore (see ProgressBar.tsx).
// ---------------------------------------------------------------------------

export class CancelledError extends Error {
  constructor(message = 'Cancelled') {
    super(message)
    this.name = 'CancelledError'
  }
}

export function isCancelled(e: unknown): boolean {
  return e instanceof CancelledError || (e as { name?: string } | null)?.name === 'CancelledError'
}

export interface TaskSnapshot {
  id: number
  label: string
  /** 0-100, or null when the total isn't known (indeterminate). */
  percent: number | null
  detail: string
  startedAt: number
  cancellable: boolean
  cancelling: boolean
}

export interface TaskHandle {
  readonly id: number
  readonly signal: AbortSignal
  update(percent: number | null, detail?: string): void
  cancel(): void
  /** Ends the task and returns how long it ran, in ms. Safe to call more than once. */
  finish(): number
}

interface InternalTask extends TaskSnapshot {
  controller: AbortController
  startPerf: number
}

let nextId = 1
const tasks = new Map<number, InternalTask>()
let snapshot: TaskSnapshot[] = []
const listeners = new Set<() => void>()
let pendingEmit: ReturnType<typeof setTimeout> | null = null

function publicView(t: InternalTask): TaskSnapshot {
  return {
    id: t.id,
    label: t.label,
    percent: t.percent,
    detail: t.detail,
    startedAt: t.startedAt,
    cancellable: t.cancellable,
    cancelling: t.cancelling,
  }
}

function emit() {
  if (pendingEmit) {
    clearTimeout(pendingEmit)
    pendingEmit = null
  }
  snapshot = [...tasks.values()].map(publicView)
  listeners.forEach((l) => l())
}

// update() can be called thousands of times a second during a scan; coalesce
// those into at most one UI notification per 100ms.
function scheduleEmit() {
  if (pendingEmit) return
  pendingEmit = setTimeout(emit, 100)
}

export function subscribeTasks(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getTasksSnapshot(): TaskSnapshot[] {
  return snapshot
}

export function startTask(label: string, opts: { cancellable?: boolean } = {}): TaskHandle {
  const id = nextId++
  const controller = new AbortController()
  const task: InternalTask = {
    id,
    label,
    percent: null,
    detail: '',
    startedAt: Date.now(),
    cancellable: opts.cancellable ?? false,
    cancelling: false,
    controller,
    startPerf: performance.now(),
  }
  tasks.set(id, task)
  emit()

  let finishedMs: number | null = null

  return {
    id,
    signal: controller.signal,
    update(percent, detail) {
      if (finishedMs !== null) return
      task.percent = percent === null ? null : Math.max(0, Math.min(100, percent))
      if (detail !== undefined) task.detail = detail
      scheduleEmit()
    },
    cancel() {
      if (finishedMs !== null || controller.signal.aborted) return
      task.cancelling = true
      controller.abort()
      emit()
    },
    finish() {
      if (finishedMs !== null) return finishedMs
      finishedMs = Math.round(performance.now() - task.startPerf)
      tasks.delete(id)
      emit()
      console.info(`[perf] ${label}: ${finishedMs} ms`)
      return finishedMs
    },
  }
}

export function cancelTask(id: number) {
  const t = tasks.get(id)
  if (!t || t.controller.signal.aborted) return
  t.cancelling = true
  t.controller.abort()
  emit()
}

/**
 * Returns a function to call once per row while scanning. It only reports a
 * throttled "N / total" progress update — it deliberately does NOT throw on
 * cancel, because Dexie swallows exceptions thrown inside each() callbacks.
 * Stop the iteration with `collection.until(scanShouldStop(task))` and call
 * `throwIfCancelled(task)` after the scan instead.
 */
export function createScanTicker(total: number, task?: TaskHandle, every = 1000): () => void {
  let n = 0
  return () => {
    n++
    if (task && n % every === 0) {
      task.update(total > 0 ? (n / total) * 100 : null, `${n.toLocaleString()} / ${total.toLocaleString()} events`)
    }
  }
}

/** Predicate for Dexie's `Collection.until()`: stops the scan once the task is cancelled. */
export function scanShouldStop(task?: TaskHandle): () => boolean {
  return () => task?.signal.aborted ?? false
}

/** Call after a scan: turns a cancel request into a CancelledError the caller can catch. */
export function throwIfCancelled(task?: TaskHandle): void {
  if (task?.signal.aborted) throw new CancelledError()
}
