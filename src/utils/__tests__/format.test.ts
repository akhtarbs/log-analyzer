import { describe, it, expect } from 'vitest'
import { formatTimestamp, msToDatetimeLocal, datetimeLocalToMs } from '../format'

describe('formatTimestamp with a timezone offset', () => {
  it('shifts the displayed time forward for a positive UTC offset', () => {
    const ms = Date.UTC(2026, 7, 4, 1, 2, 14, 567) // 01:02:14.567 UTC
    expect(formatTimestamp(ms, 420)).toBe('2026-08-04 08:02:14.567') // UTC+7
  })

  it('shifts the displayed time backward for a negative UTC offset', () => {
    const ms = Date.UTC(2026, 7, 4, 1, 2, 14, 567)
    expect(formatTimestamp(ms, -300)).toBe('2026-08-03 20:02:14.567') // UTC-5, crosses midnight
  })

  it('handles a half-hour offset such as UTC+5:30', () => {
    const ms = Date.UTC(2026, 7, 4, 1, 0, 0, 0)
    expect(formatTimestamp(ms, 330)).toBe('2026-08-04 06:30:00.000')
  })
})

describe('msToDatetimeLocal / datetimeLocalToMs with an offset — round trip', () => {
  it('round-trips through a positive offset', () => {
    const original = Date.UTC(2026, 7, 4, 1, 2, 14, 567)
    const str = msToDatetimeLocal(original, 420) // UTC+7
    expect(str).toBe('2026-08-04T08:02:14.567')
    expect(datetimeLocalToMs(str, 420)).toBe(original)
  })

  it('round-trips through a negative offset', () => {
    const original = Date.UTC(2026, 7, 4, 1, 2, 14, 567)
    const str = msToDatetimeLocal(original, -480) // UTC-8
    expect(datetimeLocalToMs(str, -480)).toBe(original)
  })

  it('round-trips through a fractional-hour offset (UTC+5:45)', () => {
    const original = Date.UTC(2026, 7, 4, 1, 2, 14, 0)
    const str = msToDatetimeLocal(original, 345)
    expect(datetimeLocalToMs(str, 345)).toBe(original)
  })

  it('the same instant formatted in two different offsets differs only by the offset', () => {
    const original = Date.UTC(2026, 7, 4, 12, 0, 0, 0)
    const utc = msToDatetimeLocal(original, 0)
    const plus9 = msToDatetimeLocal(original, 540)
    expect(utc).toBe('2026-08-04T12:00:00.000')
    expect(plus9).toBe('2026-08-04T21:00:00.000')
  })
})

describe('formatTimestamp', () => {
  it('includes milliseconds in the formatted output', () => {
    const ms = Date.UTC(2026, 7, 4, 1, 2, 14, 567) // Aug 4 2026, 01:02:14.567 UTC
    expect(formatTimestamp(ms)).toBe('2026-08-04 01:02:14.567')
  })

  it('returns an em dash for null', () => {
    expect(formatTimestamp(null)).toBe('—')
  })
})

describe('msToDatetimeLocal / datetimeLocalToMs round-trip', () => {
  it('round-trips an epoch-ms value through the datetime-local string format', () => {
    const original = Date.UTC(2026, 7, 4, 1, 2, 14, 567)
    const str = msToDatetimeLocal(original)
    expect(str).toBe('2026-08-04T01:02:14.567')
    expect(datetimeLocalToMs(str)).toBe(original)
  })

  it('handles a datetime-local value with only seconds (no ms) precision', () => {
    expect(datetimeLocalToMs('2026-08-04T01:02:14')).toBe(Date.UTC(2026, 7, 4, 1, 2, 14, 0))
  })

  it('handles a datetime-local value with only minute precision (browser default step)', () => {
    expect(datetimeLocalToMs('2026-08-04T01:02')).toBe(Date.UTC(2026, 7, 4, 1, 2, 0, 0))
  })

  it('returns null for an empty or invalid string', () => {
    expect(datetimeLocalToMs('')).toBeNull()
    expect(datetimeLocalToMs('not a date')).toBeNull()
  })

  it('zero-pads single/double digit millisecond fractions correctly', () => {
    // ".5" means 500ms, ".05" means 50ms, ".1" means 100ms — not 5ms/50ms/100ms as raw numbers
    expect(datetimeLocalToMs('2026-08-04T01:02:14.5')).toBe(Date.UTC(2026, 7, 4, 1, 2, 14, 500))
    expect(datetimeLocalToMs('2026-08-04T01:02:14.05')).toBe(Date.UTC(2026, 7, 4, 1, 2, 14, 50))
  })
})
