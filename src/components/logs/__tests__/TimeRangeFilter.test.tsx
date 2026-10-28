import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { TimezoneProvider } from '../../../hooks/useTimezone'
import { TimeRangeFilter, EMPTY_TIME_RANGE, type TimeRange } from '../TimeRangeFilter'

function setup(initial: TimeRange = EMPTY_TIME_RANGE) {
  const onChange = vi.fn()
  render(
    <TimezoneProvider>
      <TimeRangeFilter value={initial} onChange={onChange} />
    </TimezoneProvider>,
  )
  fireEvent.click(screen.getByRole('button', { name: /time range/i }))
  return onChange
}

const input = (name: string) => screen.getByLabelText(name) as HTMLInputElement
const timeValues = (side: 'From' | 'To') =>
  ['hour', 'minute', 'second', 'millisecond'].map((p) => input(`${side} ${p}`).value)

beforeEach(() => localStorage.clear()) // timezone defaults to UTC+00:00

describe('TimeRangeFilter — time defaults to zero', () => {
  it('shows zeros and keeps the time boxes disabled until a date is picked', () => {
    setup()
    expect(timeValues('From')).toEqual(['00', '00', '00', '000'])
    expect(input('From hour').disabled).toBe(true)
  })

  it('picking a date fills 00:00:00.000 and applies exactly midnight', () => {
    const onChange = setup()
    fireEvent.change(input('From date'), { target: { value: '2026-08-04' } })
    expect(input('From hour').disabled).toBe(false)
    expect(timeValues('From')).toEqual(['00', '00', '00', '000'])

    fireEvent.click(screen.getByRole('button', { name: 'Apply' }))
    expect(onChange).toHaveBeenCalledWith({ start: Date.UTC(2026, 7, 4, 0, 0, 0, 0), end: null })
  })

  it('lets the time be adjusted down to the millisecond, padding and clamping what is typed', () => {
    const onChange = setup()
    fireEvent.change(input('From date'), { target: { value: '2026-08-04' } })

    fireEvent.change(input('From hour'), { target: { value: '7' } })
    fireEvent.blur(input('From hour'))
    fireEvent.change(input('From minute'), { target: { value: '99' } }) // out of range → 59
    fireEvent.blur(input('From minute'))
    fireEvent.change(input('From millisecond'), { target: { value: '5' } })
    fireEvent.blur(input('From millisecond'))
    expect(timeValues('From')).toEqual(['07', '59', '00', '005'])

    fireEvent.click(screen.getByRole('button', { name: 'Apply' }))
    expect(onChange).toHaveBeenCalledWith({ start: Date.UTC(2026, 7, 4, 7, 59, 0, 5), end: null })
  })

  it('"To" also starts at midnight, and a shortcut sets it to the end of that day', () => {
    const onChange = setup()
    fireEvent.change(input('To date'), { target: { value: '2026-08-04' } })
    expect(timeValues('To')).toEqual(['00', '00', '00', '000'])

    fireEvent.click(screen.getAllByRole('button', { name: /end of day/i })[0])
    expect(timeValues('To')).toEqual(['23', '59', '59', '999'])

    fireEvent.click(screen.getByRole('button', { name: 'Apply' }))
    expect(onChange).toHaveBeenCalledWith({ start: null, end: Date.UTC(2026, 7, 4, 23, 59, 59, 999) })
  })

  it('clearing a date makes that side open-ended again and resets its time to zero', () => {
    const onChange = setup()
    fireEvent.change(input('From date'), { target: { value: '2026-08-04' } })
    fireEvent.change(input('From hour'), { target: { value: '9' } })
    fireEvent.blur(input('From hour'))
    fireEvent.change(input('From date'), { target: { value: '' } })
    expect(timeValues('From')).toEqual(['00', '00', '00', '000'])

    fireEvent.click(screen.getByRole('button', { name: 'Apply' }))
    expect(onChange).toHaveBeenCalledWith({ start: null, end: null })
  })

  it('shows an existing range in the fields, including its time', () => {
    setup({ start: Date.UTC(2026, 7, 4, 1, 2, 3, 4), end: null })
    expect(input('From date').value).toBe('2026-08-04')
    expect(timeValues('From')).toEqual(['01', '02', '03', '004'])
  })
})
