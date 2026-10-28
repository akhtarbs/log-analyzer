import { describe, it, expect } from 'vitest'
import { clampTimePart, composeDatetimeLocal, splitDatetimeLocal, normalizeTime, ZERO_TIME, END_OF_DAY } from '../dateparts'

describe('clampTimePart', () => {
  it('pads, clamps into range and strips non-digits', () => {
    expect(clampTimePart('hh', '7')).toBe('07')
    expect(clampTimePart('hh', '99')).toBe('23')
    expect(clampTimePart('mm', '75')).toBe('59')
    expect(clampTimePart('ss', '5')).toBe('05')
    expect(clampTimePart('ms', '5')).toBe('005')
    expect(clampTimePart('ms', '1234')).toBe('123') // longer than the field → truncated to its width
    expect(clampTimePart('ms', 'abc')).toBe('000')
    expect(clampTimePart('hh', '')).toBe('00')
  })
})

describe('compose / split', () => {
  it('a date with no time chosen composes to midnight with zero milliseconds', () => {
    expect(composeDatetimeLocal({ date: '2026-08-04', time: ZERO_TIME })).toBe('2026-08-04T00:00:00.000')
  })
  it('no date means an open-ended side, whatever the time says', () => {
    expect(composeDatetimeLocal({ date: '', time: END_OF_DAY })).toBe('')
  })
  it('round-trips a full value', () => {
    const v = '2026-08-04T07:08:09.012'
    expect(composeDatetimeLocal(splitDatetimeLocal(v))).toBe(v)
  })
  it('missing time components are treated as zero and short milliseconds are right-padded', () => {
    expect(splitDatetimeLocal('2026-08-04').time).toEqual(ZERO_TIME)
    expect(splitDatetimeLocal('2026-08-04T07:08').time).toEqual({ hh: '07', mm: '08', ss: '00', ms: '000' })
    expect(splitDatetimeLocal('2026-08-04T07:08:09.5').time.ms).toBe('500')
  })
  it('an empty or invalid value has no date and a zero time', () => {
    expect(splitDatetimeLocal('')).toEqual({ date: '', time: ZERO_TIME })
    expect(splitDatetimeLocal('nonsense')).toEqual({ date: '', time: ZERO_TIME })
  })
  it('normalizeTime repairs out-of-range fields', () => {
    expect(normalizeTime({ hh: '30', mm: '61', ss: '', ms: '5000' })).toEqual({ hh: '23', mm: '59', ss: '00', ms: '500' })
  })
})
