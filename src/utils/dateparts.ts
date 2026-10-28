// Helpers for the time-range pickers: a date plus HH / MM / SS / mmm fields that default to zero.

export interface TimeParts {
  hh: string
  mm: string
  ss: string
  ms: string
}

export interface DateTimeParts {
  /** "YYYY-MM-DD", or "" when no date is chosen (an open-ended side of the range). */
  date: string
  time: TimeParts
}

export const ZERO_TIME: TimeParts = { hh: '00', mm: '00', ss: '00', ms: '000' }
export const END_OF_DAY: TimeParts = { hh: '23', mm: '59', ss: '59', ms: '999' }

const LIMITS: Record<keyof TimeParts, { max: number; width: number }> = {
  hh: { max: 23, width: 2 },
  mm: { max: 59, width: 2 },
  ss: { max: 59, width: 2 },
  ms: { max: 999, width: 3 },
}

/** Keeps digits only, clamps into the field's range and zero-pads. Empty or invalid input becomes zero. */
export function clampTimePart(kind: keyof TimeParts, raw: string): string {
  const { max, width } = LIMITS[kind]
  const digits = raw.replace(/\D/g, '').slice(0, width)
  const n = digits === '' ? 0 : Math.min(Number(digits), max)
  return String(n).padStart(width, '0')
}

export function normalizeTime(t: TimeParts): TimeParts {
  return { hh: clampTimePart('hh', t.hh), mm: clampTimePart('mm', t.mm), ss: clampTimePart('ss', t.ss), ms: clampTimePart('ms', t.ms) }
}

/** "YYYY-MM-DDTHH:mm[:ss[.mmm]]" → parts. Missing time components are zero; an empty/invalid value has no date. */
export function splitDatetimeLocal(value: string): DateTimeParts {
  const m = value.match(/^(\d{4}-\d{2}-\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2}))?(?:\.(\d{1,3}))?)?$/)
  if (!m) return { date: '', time: { ...ZERO_TIME } }
  const [, date, hh, mm, ss, ms] = m
  return {
    date,
    time: normalizeTime({ hh: hh ?? '0', mm: mm ?? '0', ss: ss ?? '0', ms: ms ? ms.padEnd(3, '0') : '0' }),
  }
}

/** parts → "YYYY-MM-DDTHH:mm:ss.mmm", or "" when there is no date. */
export function composeDatetimeLocal(p: DateTimeParts): string {
  if (!p.date) return ''
  const t = normalizeTime(p.time)
  return `${p.date}T${t.hh}:${t.mm}:${t.ss}.${t.ms}`
}
