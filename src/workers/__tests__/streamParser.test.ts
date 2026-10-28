// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { parseLogStream, parseJsonArray, type StreamParseOptions } from '../streamParser'
import type { ParsedEvent } from '../protocol'

/** Builds a byte stream that delivers `bytes` in pieces of `pieceSize` (to split lines and UTF-8 sequences). */
function streamOf(text: string, pieceSize: number): ReadableStream<Uint8Array> {
  const bytes = new TextEncoder().encode(text)
  let pos = 0
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (pos >= bytes.length) return controller.close()
      controller.enqueue(bytes.slice(pos, pos + pieceSize))
      pos += pieceSize
    },
  })
}

function opts(text: string, extra: Partial<StreamParseOptions> = {}) {
  const chunks: ParsedEvent[][] = []
  const o: StreamParseOptions = {
    fileId: 1,
    fileName: 'test.log',
    totalBytes: new TextEncoder().encode(text).length,
    onChunk: (events) => { chunks.push(events) },
    ...extra,
  }
  return { o, chunks, all: () => chunks.flat() }
}

const authLine = (sec: number, ip: string, user = 'root') =>
  `Aug 14 08:21:${String(sec).padStart(2, '0')} server sshd[1234]: Failed password for ${user} from ${ip} port 52122 ssh2`

describe('parseLogStream', () => {
  it('parses lines regardless of how the byte stream is split, including CRLF endings', async () => {
    const text = [authLine(1, '1.1.1.1'), authLine(2, '2.2.2.2'), authLine(3, '3.3.3.3')].join('\r\n') + '\r\n'
    for (const piece of [1, 7, 64, 100000]) {
      const { o, all } = opts(text)
      const res = await parseLogStream(streamOf(text, piece), o)
      expect(res.totalEvents).toBe(3)
      expect(all().map((e) => e.srcIp)).toEqual(['1.1.1.1', '2.2.2.2', '3.3.3.3'])
      expect(all()[0].rawLog.endsWith('\r')).toBe(false)
    }
  })

  it('does not corrupt multi-byte characters that are split across stream pieces', async () => {
    const text = [
      '{"timestamp":"2026-08-14T08:21:01Z","message":"halo dunia — café ☕ 日本語","src_ip":"1.1.1.1"}',
      '{"timestamp":"2026-08-14T08:21:02Z","message":"ok","src_ip":"2.2.2.2"}',
    ].join('\n')
    const { o, all } = opts(text, { fileName: 'x.jsonl' })
    await parseLogStream(streamOf(text, 3), o) // 3-byte pieces slice through multi-byte sequences
    expect(all()[0].message).toBe('halo dunia — café ☕ 日本語')
  })

  it('handles a last line with no trailing newline', async () => {
    const text = authLine(1, '1.1.1.1') + '\n' + authLine(2, '2.2.2.2')
    const { o, all } = opts(text)
    const res = await parseLogStream(streamOf(text, 16), o)
    expect(res.totalEvents).toBe(2)
    expect(all()[1].srcIp).toBe('2.2.2.2')
  })

  it('numbers lines physically (blank lines are skipped but still counted)', async () => {
    const text = [authLine(1, '1.1.1.1'), '', authLine(2, '2.2.2.2')].join('\n')
    const { o, all } = opts(text)
    await parseLogStream(streamOf(text, 50), o)
    expect(all().map((e) => e.lineNumber)).toEqual([1, 3])
  })

  it('auto-detects the parser and reports it', async () => {
    const text = Array.from({ length: 5 }, (_, i) => authLine(i, '9.9.9.9')).join('\n')
    const { o } = opts(text)
    const res = await parseLogStream(streamOf(text, 40), o)
    expect(res.parser).toBe('linux_auth')
  })

  it('uses the first row as the header for CSV and does not emit it as an event', async () => {
    const text = 'timestamp,src_ip,event_type,status\n2026-08-14T08:21:01Z,1.1.1.1,SSH_LOGIN_FAILED,FAILED\n2026-08-14T08:21:02Z,2.2.2.2,HTTP_200,OK\n'
    const { o, all } = opts(text, { fileName: 'data.csv' })
    const res = await parseLogStream(streamOf(text, 20), o)
    expect(res.parser).toBe('csv')
    expect(res.totalEvents).toBe(2)
    expect(all()[0].srcIp).toBe('1.1.1.1')
  })

  it('splits output into chunks of the requested size and keeps the order', async () => {
    const text = Array.from({ length: 1000 }, (_, i) => authLine(i % 60, `10.0.${i >> 8}.${i & 255}`)).join('\n')
    const { o, chunks, all } = opts(text, { chunkEvents: 100 })
    const res = await parseLogStream(streamOf(text, 512), o)
    expect(res.totalEvents).toBe(1000)
    // The first 200 lines are held back to detect the format, so the first chunk may carry them all at once;
    // after that a chunk is flushed once it reaches the target, overshooting by at most one read (a few lines).
    expect(chunks[0].length).toBeLessThanOrEqual(100 + 200)
    for (const c of chunks.slice(1, -1)) expect(c.length).toBe(100) // exactly the target — no overshoot
    expect(chunks.length).toBeGreaterThanOrEqual(8)
    expect(all().map((e) => e.lineNumber)).toEqual(Array.from({ length: 1000 }, (_, i) => i + 1))
  })

  it('never builds a chunk larger than the target, even when the source delivers the whole file as one piece', async () => {
    const text = Array.from({ length: 5000 }, (_, i) => authLine(i % 60, '5.5.5.5')).join('\n')
    const { o, chunks } = opts(text, { chunkEvents: 250 })
    const res = await parseLogStream(streamOf(text, text.length * 2), o) // a single enormous read
    expect(res.totalEvents).toBe(5000)
    expect(chunks.length).toBeGreaterThanOrEqual(19)
    expect(Math.max(...chunks.slice(1).map((c) => c.length))).toBeLessThanOrEqual(250)
  })

  it('waits for a slow consumer before reading on (backpressure) and reports the blocked time', async () => {
    const text = Array.from({ length: 600 }, (_, i) => authLine(i % 60, '5.5.5.5')).join('\n')
    let active = 0
    let maxActive = 0
    const { o } = opts(text, {
      chunkEvents: 100,
      onChunk: async () => {
        active++
        maxActive = Math.max(maxActive, active)
        await new Promise((r) => setTimeout(r, 15))
        active--
      },
    })
    const res = await parseLogStream(streamOf(text, 256), o)
    expect(maxActive).toBe(1) // never more than one chunk outstanding
    expect(res.blockedMs).toBeGreaterThan(30)
    expect(res.totalEvents).toBe(600)
  })

  it('computes file statistics while parsing', async () => {
    const text = [authLine(1, '1.1.1.1'), authLine(2, '1.1.1.1'), authLine(3, '2.2.2.2')].join('\n')
    const { o } = opts(text)
    const res = await parseLogStream(streamOf(text, 30), o)
    expect(res.stats.totalEvents).toBe(3)
    expect(res.stats.failedAuth).toBe(3)
    expect(res.stats.top.srcIp).toEqual([['1.1.1.1', 2], ['2.2.2.2', 1]])
    expect(res.stats.top.username[0]).toEqual(['root', 3])
  })

  it('reports byte-based progress that ends at 100', async () => {
    const text = Array.from({ length: 300 }, (_, i) => authLine(i % 60, '5.5.5.5')).join('\n')
    const seen: number[] = []
    const { o } = opts(text, { chunkEvents: 50, onProgress: (p) => seen.push(p.percent) })
    await parseLogStream(streamOf(text, 400), o)
    expect(seen.length).toBeGreaterThan(2)
    expect(seen[seen.length - 1]).toBe(100)
    expect([...seen].sort((a, b) => a - b)).toEqual(seen) // monotonic
  })

  it('handles an empty file', async () => {
    const { o } = opts('')
    const res = await parseLogStream(streamOf('', 10), o)
    expect(res.totalEvents).toBe(0)
    expect(res.parser).toBe('generic')
  })

  it('streams a few hundred thousand lines quickly with flat memory use (sanity check)', async () => {
    const line = '172.81.132.189 - - [04/Aug/2026:08:02:14 +0700] "GET /a/b.json HTTP/1.1" 404 10426 "-" "Mozilla/5.0 (X11; Ubuntu)"'
    const n = 200_000
    const text = Array.from({ length: n }, () => line).join('\n')
    let chunkCount = 0
    const { o } = opts(text, { chunkEvents: 5000, onChunk: () => { chunkCount++ } })
    const t = performance.now()
    const res = await parseLogStream(streamOf(text, 65536), o)
    const ms = performance.now() - t
    console.info(`[bench] parsed ${n} lines in ${Math.round(ms)} ms (${Math.round(n / (ms / 1000))} lines/s)`)
    expect(res.totalEvents).toBe(n)
    expect(res.stats.top.url[0]).toEqual(['/a/b.json', n])
    expect(chunkCount).toBeGreaterThanOrEqual(n / 5000)
  })
})

describe('parseJsonArray', () => {
  it('parses a JSON array into events and stats', async () => {
    const text = JSON.stringify([
      { timestamp: '2026-08-14T08:21:01Z', src_ip: '1.1.1.1', event_type: 'HTTP_200' },
      { timestamp: '2026-08-14T08:21:02Z', src_ip: '1.1.1.1', event_type: 'HTTP_404' },
    ])
    const { o, all } = opts(text, { fileName: 'x.json' })
    const res = await parseJsonArray(text, o)
    expect(res.parser).toBe('json')
    expect(all()).toHaveLength(2)
    expect(res.stats.top.srcIp[0]).toEqual(['1.1.1.1', 2])
  })

  it('rejects JSON that is not an array', async () => {
    const { o } = opts('{}', { fileName: 'x.json' })
    await expect(parseJsonArray('{"a":1}', o)).rejects.toThrow(/not an array/)
  })
})
