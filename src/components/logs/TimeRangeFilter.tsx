import { useEffect, useRef, useState } from 'react'
import { CalendarClock, X } from 'lucide-react'
import { Button } from '../ui/Button'
import { msToDatetimeLocal, datetimeLocalToMs } from '../../utils/format'
import { useTimezone } from '../../hooks/useTimezone'
import {
  END_OF_DAY,
  ZERO_TIME,
  clampTimePart,
  composeDatetimeLocal,
  normalizeTime,
  splitDatetimeLocal,
  type TimeParts,
} from '../../utils/dateparts'

export interface TimeRange {
  start: number | null
  end: number | null
}

export const EMPTY_TIME_RANGE: TimeRange = { start: null, end: null }

const FIELD_BASE =
  'rounded-md border border-[color:var(--color-border-strong)] bg-[color:var(--color-bg)] px-2 py-1.5 text-xs font-mono-tabular'

const TIME_FIELDS: { key: keyof TimeParts; label: string; width: string; maxLength: number }[] = [
  { key: 'hh', label: 'Hour', width: 'w-10', maxLength: 2 },
  { key: 'mm', label: 'Minute', width: 'w-10', maxLength: 2 },
  { key: 'ss', label: 'Second', width: 'w-10', maxLength: 2 },
  { key: 'ms', label: 'Millisecond', width: 'w-12', maxLength: 3 },
]

/**
 * A date plus hour / minute / second / millisecond fields. Picking a date fills
 * the time with 00:00:00.000, so choosing just a day behaves predictably.
 * `value` / `onChange` use the "YYYY-MM-DDTHH:mm:ss.mmm" format ("" = no date).
 */
function DateTimeField({
  label,
  value,
  onChange,
  endOfDayShortcut,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  endOfDayShortcut?: boolean
}) {
  const parts = splitDatetimeLocal(value)
  // The time boxes keep their own text while being typed in; it is clamped and committed on blur.
  const [draft, setDraft] = useState<TimeParts>(parts.time)

  useEffect(() => {
    setDraft(splitDatetimeLocal(value).time)
  }, [value])

  const commit = (time: TimeParts) => {
    const clean = normalizeTime(time)
    setDraft(clean)
    onChange(composeDatetimeLocal({ date: parts.date, time: clean }))
  }

  const onDateChange = (date: string) => {
    // A newly picked date starts at midnight; clearing the date also clears the time back to zero.
    if (!date) return onChange('')
    onChange(composeDatetimeLocal({ date, time: parts.date ? normalizeTime(draft) : ZERO_TIME }))
  }

  const hasDate = parts.date !== ''

  return (
    <div>
      <label className="text-[10px] uppercase tracking-wide text-[color:var(--color-text-faint)] block mb-1">{label}</label>
      <div className="flex flex-wrap items-center gap-1.5">
        <input
          type="date"
          aria-label={`${label} date`}
          value={parts.date}
          onChange={(e) => onDateChange(e.target.value)}
          className={`${FIELD_BASE} w-36`}
        />
        <div className="flex items-center gap-0.5">
          {TIME_FIELDS.map((f, i) => (
            <span key={f.key} className="flex items-center gap-0.5">
              {i > 0 && (
                <span className="text-[color:var(--color-text-faint)] text-xs">{i === 3 ? '.' : ':'}</span>
              )}
              <input
                type="text"
                inputMode="numeric"
                aria-label={`${label} ${f.label.toLowerCase()}`}
                maxLength={f.maxLength}
                disabled={!hasDate}
                value={draft[f.key]}
                onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value.replace(/\D/g, '') })}
                onBlur={() => commit({ ...draft, [f.key]: clampTimePart(f.key, draft[f.key]) })}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commit(draft)
                }}
                onFocus={(e) => e.target.select()}
                className={`${FIELD_BASE} ${f.width} text-center px-1 disabled:opacity-40`}
              />
            </span>
          ))}
        </div>
      </div>
      {endOfDayShortcut && (
        <button
          type="button"
          disabled={!hasDate}
          onClick={() => commit(END_OF_DAY)}
          className="mt-1 text-[10px] text-[color:var(--color-text-muted)] underline decoration-dotted hover:text-[color:var(--color-accent)] disabled:opacity-40 disabled:no-underline"
        >
          Set to end of day (23:59:59.999)
        </button>
      )}
    </div>
  )
}

export function TimeRangeFilter({ value, onChange }: { value: TimeRange; onChange: (v: TimeRange) => void }) {
  const { offsetMinutes, label } = useTimezone()
  const [open, setOpen] = useState(false)
  const [startInput, setStartInput] = useState(value.start !== null ? msToDatetimeLocal(value.start, offsetMinutes) : '')
  const [endInput, setEndInput] = useState(value.end !== null ? msToDatetimeLocal(value.end, offsetMinutes) : '')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setStartInput(value.start !== null ? msToDatetimeLocal(value.start, offsetMinutes) : '')
    setEndInput(value.end !== null ? msToDatetimeLocal(value.end, offsetMinutes) : '')
    // Re-render the picker fields in the newly selected timezone whenever it changes,
    // so the displayed wall-clock values keep matching the Timestamp column.
  }, [value.start, value.end, offsetMinutes])

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const apply = () => {
    onChange({
      start: startInput ? datetimeLocalToMs(startInput, offsetMinutes) : null,
      end: endInput ? datetimeLocalToMs(endInput, offsetMinutes) : null,
    })
    setOpen(false)
  }

  const clear = () => {
    setStartInput('')
    setEndInput('')
    onChange(EMPTY_TIME_RANGE)
    setOpen(false)
  }

  const active = value.start !== null || value.end !== null

  return (
    <div className="relative" ref={ref}>
      <Button variant="secondary" size="sm" onClick={() => setOpen((v) => !v)}>
        <CalendarClock size={14} /> {active ? 'Time Range: Active' : 'Time Range'}
      </Button>

      {open && (
        <div className="absolute left-0 mt-1 w-[26rem] max-w-[90vw] rounded-md border border-[color:var(--color-border-strong)] bg-[color:var(--color-surface)] shadow-xl z-30 p-3 space-y-3">
          <DateTimeField label="From" value={startInput} onChange={setStartInput} />
          <DateTimeField label="To" value={endInput} onChange={setEndInput} endOfDayShortcut />
          <p className="text-[10px] text-[color:var(--color-text-faint)]">
            Pick a date and the time starts at 00:00:00.000; adjust hour, minute, second or millisecond if needed. Times are in{' '}
            <span className="text-[color:var(--color-text-muted)] font-medium">{label}</span>, matching the Timestamp column — change the display
            timezone in Settings. Leave a date empty for an open-ended range. To include the whole last day, use "end of day".
          </p>
          <div className="flex justify-between gap-2 pt-1 border-t border-[color:var(--color-border)]">
            <Button variant="ghost" size="sm" onClick={clear}>
              <X size={12} /> Clear
            </Button>
            <Button variant="primary" size="sm" onClick={apply}>Apply</Button>
          </div>
        </div>
      )}
    </div>
  )
}
