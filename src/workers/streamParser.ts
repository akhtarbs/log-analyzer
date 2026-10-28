// ---------------------------------------------------------------------------
// Streaming log parser. Pure (no worker globals) so it can be unit-tested.
//
// The old importer did `await file.text()` and split the whole content, which
// fails on very large files (V8 caps a string at ~512 MB) and holds every line
// in memory at once. This reads the file as a byte stream instead, splitting
// lines incrementally, parsing in batches, and — through the awaited onChunk
// hook — pausing whenever the database writer falls behind.
// ---------------------------------------------------------------------------
import { detectParser, jsonParser } from '../parsers'
import { resetCsvHeader, setCsvHeader, splitCsvLine } from '../parsers/csv'
import type { Parser } from '../parsers/types'
import { StatsAccumulator } from '../analysis/aggregate'
import type { FileStats, ParserName } from '../types'
import type { ParsedEvent } from './protocol'

const SAMPLE_LINES = 200
const DEFAULT_CHUNK_EVENTS = 5000

export interface StreamParseOptions {
  fileId: number
  fileName: string
  totalBytes: number
  /** Events per chunk handed to onChunk. */
  chunkEvents?: number
  /** Called with each batch. The parser waits for the returned promise before reading on (backpressure). */
  onChunk(events: ParsedEvent[], info: { parser: ParserName; bytesProcessed: number }): void | Promise<void>
  onProgress?(info: { percent: number; eventsSoFar: number }): void
}

export interface StreamParseResult {
  parser: ParserName
  totalEvents: number
  stats: FileStats
  /** Total wall time, ms. */
  elapsedMs: number
  /** Part of elapsedMs spent waiting inside onChunk. */
  blockedMs: number
}

class Sink {
  private buffer: ParsedEvent[] = []
  events = 0
  blockedMs = 0
  readonly acc = new StatsAccumulator()
  parserName: ParserName = 'generic'
  bytesProcessed = 0

  private opts: StreamParseOptions

  constructor(opts: StreamParseOptions) {
    this.opts = opts
  }

  push(event: ParsedEvent) {
    this.acc.add(event)
    this.buffer.push(event)
    this.events++
  }

  get full() {
    return this.buffer.length >= (this.opts.chunkEvents ?? DEFAULT_CHUNK_EVENTS)
  }

  async flush() {
    if (this.buffer.length === 0) return
    const events = this.buffer
    this.buffer = []
    const t = performance.now()
    await this.opts.onChunk(events, { parser: this.parserName, bytesProcessed: this.bytesProcessed })
    this.blockedMs += performance.now() - t
    this.report()
  }

  report() {
    const { totalBytes } = this.opts
    this.opts.onProgress?.({
      percent: totalBytes > 0 ? Math.min(100, (this.bytesProcessed / totalBytes) * 100) : 100,
      eventsSoFar: this.events,
    })
  }
}

function stripCR(line: string): string {
  return line.endsWith('\r') ? line.slice(0, -1) : line
}

export async function parseLogStream(
  stream: ReadableStream<Uint8Array>,
  opts: StreamParseOptions,
): Promise<StreamParseResult> {
  const t0 = performance.now()
  const sink = new Sink(opts)
  const reader = stream.getReader()
  const decoder = new TextDecoder('utf-8')

  let parser: Parser | null = null
  let pending: { line: string; no: number }[] = []
  let leftover = ''
  let lineNo = 0

  const parseOne = (line: string, no: number) => {
    const parsed = parser!.parseLine(line)
    if (parsed) sink.push({ ...parsed, rawLog: line, lineNumber: no })
  }

  // The parser is chosen from the first lines, so those are held back briefly.
  const choose = () => {
    const sample = pending.map((p) => p.line)
    parser = detectParser(sample, opts.fileName)
    sink.parserName = parser.name
    if (parser.name === 'csv' && pending.length > 0) setCsvHeader(splitCsvLine(pending[0].line))
    else resetCsvHeader()
    const queued = pending
    pending = []
    for (let i = parser.name === 'csv' ? 1 : 0; i < queued.length; i++) parseOne(queued[i].line, queued[i].no)
  }

  const handleLine = (raw: string) => {
    lineNo++
    const line = stripCR(raw)
    if (line.length === 0) return
    if (!parser) {
      pending.push({ line, no: lineNo })
      if (pending.length >= SAMPLE_LINES) choose()
      return
    }
    parseOne(line, lineNo)
  }

  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    sink.bytesProcessed += value.byteLength
    leftover += decoder.decode(value, { stream: true })
    const parts = leftover.split('\n')
    leftover = parts.pop() ?? ''
    for (const raw of parts) {
      handleLine(raw)
      // Checked per line, not per read: a source may hand over a huge piece at once, and a
      // chunk must never grow past the target (that would defeat backpressure and bloat memory).
      if (sink.full) await sink.flush()
    }
  }

  leftover += decoder.decode()
  if (leftover.length > 0) handleLine(leftover)
  if (!parser) choose() // short file: fewer than SAMPLE_LINES lines
  sink.bytesProcessed = opts.totalBytes
  await sink.flush()

  const elapsedMs = performance.now() - t0
  return {
    parser: sink.parserName,
    totalEvents: sink.events,
    stats: sink.acc.finish(opts.fileId),
    elapsedMs,
    blockedMs: sink.blockedMs,
  }
}

/**
 * A `.json` file holding one big array can't be streamed record by record with
 * JSON.parse, so it is read whole. Very large JSON should be converted to JSONL.
 */
export async function parseJsonArray(text: string, opts: StreamParseOptions): Promise<StreamParseResult> {
  const t0 = performance.now()
  const sink = new Sink(opts)
  sink.parserName = 'json'

  const arr = JSON.parse(text)
  if (!Array.isArray(arr)) throw new Error('JSON file is not an array of records')

  for (let i = 0; i < arr.length; i++) {
    const line = JSON.stringify(arr[i])
    const parsed = jsonParser.parseLine(line)
    if (parsed) sink.push({ ...parsed, rawLog: line, lineNumber: i + 1 })
    if (sink.full) {
      sink.bytesProcessed = Math.round(((i + 1) / arr.length) * opts.totalBytes)
      await sink.flush()
    }
  }
  sink.bytesProcessed = opts.totalBytes
  await sink.flush()

  return {
    parser: 'json',
    totalEvents: sink.events,
    stats: sink.acc.finish(opts.fileId),
    elapsedMs: performance.now() - t0,
    blockedMs: sink.blockedMs,
  }
}

/** Entry point used by the worker: picks streaming vs. whole-document JSON. */
export async function parseLogFile(file: File, opts: Omit<StreamParseOptions, 'totalBytes' | 'fileName'>): Promise<StreamParseResult> {
  const full: StreamParseOptions = { ...opts, fileName: file.name, totalBytes: file.size }
  if (file.name.toLowerCase().endsWith('.json')) {
    const head = (await file.slice(0, 4096).text()).trimStart()
    if (head.startsWith('[')) {
      try {
        return await parseJsonArray(await file.text(), full)
      } catch (e) {
        throw new Error(
          `Could not read this JSON file as one array (${(e as Error).message}). For very large files, convert it to JSONL (one JSON object per line).`,
        )
      }
    }
  }
  return parseLogStream(file.stream() as ReadableStream<Uint8Array>, full)
}
