import type { ParsedFields } from '../parsers/types'
import type { FileStats, ParserName } from '../types'

export type ParsedEvent = ParsedFields & { rawLog: string; lineNumber: number }

/** main → worker */
export interface ParseRequest {
  type: 'parse'
  fileId: number
  file: File
  /** Events per chunk (default 5000). Mainly a tuning/testing knob. */
  chunkEvents?: number
}
export interface AckMessage {
  type: 'ack'
}
export type WorkerInbound = ParseRequest | AckMessage

/** worker → main */
export interface ParseProgress {
  type: 'progress'
  /** Share of the file's bytes consumed so far, 0-100. */
  percent: number
  eventsSoFar: number
}

export interface ParseChunk {
  type: 'chunk'
  fileId: number
  events: ParsedEvent[]
  parser: ParserName
  /** Bytes of the source file consumed when this chunk was produced (for "saving" progress). */
  bytesProcessed: number
  totalBytes: number
}

export interface ParseDone {
  type: 'done'
  fileId: number
  parser: ParserName
  totalEvents: number
  /** Wall time of the whole parse, ms. */
  processingTimeMs: number
  /** Time spent waiting for the database to catch up (backpressure), ms. */
  blockedMs: number
  stats: FileStats
}

export interface ParseError {
  type: 'error'
  message: string
}

export type WorkerOutbound = ParseProgress | ParseChunk | ParseDone | ParseError
