/// <reference lib="webworker" />
import { parseLogFile } from './streamParser'
import type { WorkerInbound, WorkerOutbound } from './protocol'

// How many chunks may be written-but-not-yet-acknowledged. Keeps memory flat on
// huge files: parsing pauses until the main thread confirms earlier chunks are saved.
const MAX_IN_FLIGHT = 3

let inFlight = 0
let wake: (() => void) | null = null

function post(msg: WorkerOutbound) {
  ;(self as unknown as Worker).postMessage(msg)
}

self.onmessage = async (e: MessageEvent<WorkerInbound>) => {
  const msg = e.data

  if (msg.type === 'ack') {
    inFlight = Math.max(0, inFlight - 1)
    wake?.()
    wake = null
    return
  }
  if (msg.type !== 'parse') return

  // A fresh request starts with a clean slate (each import normally gets its own worker, but don't rely on it).
  inFlight = 0
  wake = null

  try {
    const result = await parseLogFile(msg.file, {
      fileId: msg.fileId,
      chunkEvents: msg.chunkEvents,
      onProgress: ({ percent, eventsSoFar }) => post({ type: 'progress', percent, eventsSoFar }),
      onChunk: async (events, info) => {
        post({
          type: 'chunk',
          fileId: msg.fileId,
          events,
          parser: info.parser,
          bytesProcessed: info.bytesProcessed,
          totalBytes: msg.file.size,
        })
        inFlight++
        while (inFlight >= MAX_IN_FLIGHT) {
          await new Promise<void>((resolve) => {
            wake = resolve
          })
        }
      },
    })
    post({
      type: 'done',
      fileId: msg.fileId,
      parser: result.parser,
      totalEvents: result.totalEvents,
      processingTimeMs: result.elapsedMs,
      blockedMs: result.blockedMs,
      stats: result.stats,
    })
  } catch (err) {
    post({ type: 'error', message: err instanceof Error ? err.message : String(err) })
  }
}
