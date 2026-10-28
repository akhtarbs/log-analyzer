export function formatTimestamp(ts: number | null, offsetMinutes = 0): string {
  if (ts === null) return '—'
  const d = new Date(ts + offsetMinutes * 60000)
  // Includes milliseconds (23 chars: "YYYY-MM-DD HH:MM:SS.mmm") so the display
  // matches the precision available in the time-range filter. Uses the UTC
  // getters on the pre-shifted date so this is independent of the browser's
  // own system timezone — the offset is purely the one the person picked.
  return d.toISOString().replace('T', ' ').replace('Z', '').slice(0, 23)
}

/** Converts an epoch-ms timestamp into the string format <input type="datetime-local" step="0.001">
 *  expects, shifted by the given UTC offset so it lines up with how formatTimestamp displays times. */
export function msToDatetimeLocal(ms: number, offsetMinutes = 0): string {
  const d = new Date(ms + offsetMinutes * 60000)
  const pad = (n: number, len = 2) => String(n).padStart(len, '0')
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}.${pad(d.getUTCMilliseconds(), 3)}`
}

/** Parses a <input type="datetime-local"> value back into epoch ms, treating the
 *  literal date/time components as being in the given UTC offset (matching
 *  msToDatetimeLocal / formatTimestamp for the same offset). */
export function datetimeLocalToMs(value: string, offsetMinutes = 0): number | null {
  if (!value) return null
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?(?:\.(\d{1,3}))?$/)
  if (!m) return null
  const [, y, mo, d, h, mi, s, ms] = m
  const msVal = ms ? Number(ms.padEnd(3, '0')) : 0
  const shifted = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), s ? Number(s) : 0, msVal)
  return shifted - offsetMinutes * 60000
}

export function formatNumber(n: number): string {
  return n.toLocaleString('en-US')
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

/** "12%" / "4.2%" (one decimal below 10%), or an em dash when there is nothing to measure. */
export function formatPercent(ratio: number | null): string {
  if (ratio === null || !isFinite(ratio)) return '—'
  const pct = ratio * 100
  if (pct > 0 && pct < 0.1) return '<0.1%'
  return pct < 10 ? `${pct.toFixed(1)}%` : `${Math.round(pct)}%`
}
