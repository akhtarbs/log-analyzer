import { db } from '../db/database'
import type { LogFile, ParserName } from '../types'
import type { ParseChunk, ParseDone, WorkerInbound, WorkerOutbound } from '../workers/protocol'
import { CancelledError, startTask } from './progress'
import { createSerialQueue } from '../utils/serialQueue'
import { deleteLogFile } from './fileService'

export interface ImportProgress {
  fileName: string
  phase: 'reading' | 'parsing' | 'saving' | 'done'
  parsePercent: number
  savePercent: number
  /** Events written to the database so far. */
  events: number
}

export interface ImportTimings {
  /** Reading the file up front (only done for small files whose original text is kept). */
  readMs: number
  /** Reading + parsing inside the worker, excluding time it spent waiting for the database. */
  parseMs: number
  /** Time spent writing to IndexedDB. */
  saveMs: number
  totalMs: number
}

export interface ImportResult {
  fileId: number
  parser: ParserName
  totalEvents: number
  processingTimeMs: number
  timings: ImportTimings
}

export type ImportOutcome = { file: File; result: ImportResult } | { file: File; error: unknown }

const MAX_ORIGINAL_STORE_BYTES = 2 * 1024 * 1024 // 2MB — beyond this, original text isn't kept

export interface ImportOptions {
  /** Events per chunk handed from the parser to the database writer. Default 5000. */
  chunkEvents?: number
}

export function importFile(file: File, onProgress: (p: ImportProgress) => void, options: ImportOptions = {}): Promise<ImportResult> {
  const task = startTask(`Importing ${file.name}`, { cancellable: true })

  return new Promise<ImportResult>((resolve, reject) => {
    const t0 = performance.now()
    let worker: Worker | null = null
    let fileId: number | null = null
    let settled = false
    let cancelRequested = false

    let savedCount = 0
    let savedBytes = 0
    let totalBytes = file.size
    let parsePercent = 0
    let readMs = 0
    let saveMs = 0

    const send = (msg: WorkerInbound) => worker?.postMessage(msg)

    const emitProgress = (phase: ImportProgress['phase']) => {
      const done = phase === 'done'
      onProgress({
        fileName: file.name,
        phase,
        parsePercent: done ? 100 : parsePercent,
        savePercent: done ? 100 : totalBytes > 0 ? Math.min(100, Math.round((savedBytes / totalBytes) * 100)) : 0,
        events: savedCount,
      })
    }

    // Removes whatever was written for this file so a failed/cancelled import
    // doesn't leave a half-imported file behind.
    const fail = async (err: unknown) => {
      if (settled) return
      settled = true
      worker?.terminate()
      if (fileId !== null) {
        try {
          // Batched, so cleaning up a big partial import is visible and doesn't freeze the page.
          task.update(null, 'Cleaning up partial import…')
          await deleteLogFile(fileId, task)
        } catch {
          /* best effort */
        }
      }
      task.finish()
      reject(err)
    }

    const queue = createSerialQueue(fail)

    task.signal.addEventListener('abort', () => {
      cancelRequested = true
      worker?.terminate()
      queue(() => fail(new CancelledError()))
    })

    const handleChunk = async (msg: ParseChunk) => {
      totalBytes = msg.totalBytes
      const tSave = performance.now()
      const rows = msg.events.map((ev) => ({ ...ev, fileId: msg.fileId, mark: null }))
      await db.logs.bulkAdd(rows as any)
      saveMs += performance.now() - tSave
      // Only now may the worker produce more: this is what keeps memory flat.
      send({ type: 'ack' })
      savedCount += rows.length
      savedBytes = msg.bytesProcessed
      task.update(totalBytes > 0 ? (savedBytes / totalBytes) * 100 : null, `${savedCount.toLocaleString()} events saved`)
      emitProgress('saving')
    }

    const handleDone = async (msg: ParseDone) => {
      const totalMs = performance.now() - t0
      await db.fileStats.put(msg.stats)
      await db.logFiles.update(msg.fileId, {
        eventCount: msg.totalEvents,
        parser: msg.parser,
        processingTimeMs: totalMs,
      })
      settled = true
      worker?.terminate()
      emitProgress('done')
      task.finish()
      const timings: ImportTimings = {
        readMs,
        parseMs: Math.max(0, msg.processingTimeMs - msg.blockedMs),
        saveMs,
        totalMs,
      }
      console.info(
        `[perf] import ${file.name}: ${msg.totalEvents} events | read ${Math.round(readMs)} ms, parse ${Math.round(timings.parseMs)} ms, db save ${Math.round(saveMs)} ms, total ${Math.round(totalMs)} ms`,
      )
      resolve({
        fileId: msg.fileId,
        parser: msg.parser,
        totalEvents: msg.totalEvents,
        processingTimeMs: totalMs,
        timings,
      })
    }

    const setup = async () => {
      emitProgress('reading')
      task.update(null, 'Preparing…')

      // The original text is only kept for small files, so large files are never
      // read into memory on this side — the worker streams them from disk.
      let original: string | undefined
      if (file.size <= MAX_ORIGINAL_STORE_BYTES) {
        const tRead = performance.now()
        original = await file.text()
        readMs = performance.now() - tRead
      }
      if (settled || cancelRequested) return

      const record: LogFile = {
        name: file.name,
        size: file.size,
        importedAt: Date.now(),
        eventCount: 0,
        parser: 'generic',
        processingTimeMs: 0,
        storeOriginal: original !== undefined,
        originalContent: original,
        active: true,
      }
      fileId = await db.logFiles.add(record)
      if (settled || cancelRequested) {
        await fail(new CancelledError())
        return
      }

      task.update(0, 'Parsing…')
      worker = new Worker(new URL('../workers/logParser.worker.ts', import.meta.url), { type: 'module' })

      worker.onmessage = (e: MessageEvent<WorkerOutbound>) => {
        const msg = e.data
        if (msg.type === 'progress') {
          parsePercent = msg.percent
          if (!settled) emitProgress('parsing')
          return
        }
        // chunk / done / error go through the serial queue so "done" can never be
        // handled before every earlier chunk has been written.
        queue(async () => {
          if (settled || cancelRequested) return
          if (msg.type === 'chunk') await handleChunk(msg)
          else if (msg.type === 'done') await handleDone(msg)
          else if (msg.type === 'error') await fail(new Error(msg.message))
        })
      }

      worker.onerror = (ev) => {
        queue(() => fail(new Error(ev.message || 'Parser worker failed')))
      }

      send({ type: 'parse', fileId, file, chunkEvents: options.chunkEvents })
    }

    setup().catch((e) => queue(() => fail(e)))
  })
}

/** Imports files one after another; one failing/cancelled file doesn't stop the rest. */
export async function importFiles(
  files: File[],
  onProgress: (fileName: string, p: ImportProgress) => void,
  options: ImportOptions = {},
): Promise<ImportOutcome[]> {
  const outcomes: ImportOutcome[] = []
  for (const file of files) {
    try {
      const result = await importFile(file, (p) => onProgress(file.name, p), options)
      outcomes.push({ file, result })
    } catch (error) {
      outcomes.push({ file, error })
    }
  }
  return outcomes
}
