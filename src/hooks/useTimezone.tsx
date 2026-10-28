import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'

const STORAGE_KEY = 'log-analyzer:timezone-offset-minutes'

/** Common UTC/GMT offsets, including the real-world half/quarter-hour zones. */
export const TIMEZONE_OPTIONS: { offsetMinutes: number; label: string }[] = [
  { offsetMinutes: -720, label: 'UTC-12:00' },
  { offsetMinutes: -660, label: 'UTC-11:00' },
  { offsetMinutes: -600, label: 'UTC-10:00' },
  { offsetMinutes: -570, label: 'UTC-09:30' },
  { offsetMinutes: -540, label: 'UTC-09:00' },
  { offsetMinutes: -480, label: 'UTC-08:00' },
  { offsetMinutes: -420, label: 'UTC-07:00' },
  { offsetMinutes: -360, label: 'UTC-06:00' },
  { offsetMinutes: -300, label: 'UTC-05:00' },
  { offsetMinutes: -240, label: 'UTC-04:00' },
  { offsetMinutes: -210, label: 'UTC-03:30' },
  { offsetMinutes: -180, label: 'UTC-03:00' },
  { offsetMinutes: -120, label: 'UTC-02:00' },
  { offsetMinutes: -60, label: 'UTC-01:00' },
  { offsetMinutes: 0, label: 'UTC+00:00' },
  { offsetMinutes: 60, label: 'UTC+01:00' },
  { offsetMinutes: 120, label: 'UTC+02:00' },
  { offsetMinutes: 180, label: 'UTC+03:00' },
  { offsetMinutes: 210, label: 'UTC+03:30' },
  { offsetMinutes: 240, label: 'UTC+04:00' },
  { offsetMinutes: 270, label: 'UTC+04:30' },
  { offsetMinutes: 300, label: 'UTC+05:00' },
  { offsetMinutes: 330, label: 'UTC+05:30' },
  { offsetMinutes: 345, label: 'UTC+05:45' },
  { offsetMinutes: 360, label: 'UTC+06:00' },
  { offsetMinutes: 390, label: 'UTC+06:30' },
  { offsetMinutes: 420, label: 'UTC+07:00' },
  { offsetMinutes: 480, label: 'UTC+08:00' },
  { offsetMinutes: 525, label: 'UTC+08:45' },
  { offsetMinutes: 540, label: 'UTC+09:00' },
  { offsetMinutes: 570, label: 'UTC+09:30' },
  { offsetMinutes: 600, label: 'UTC+10:00' },
  { offsetMinutes: 630, label: 'UTC+10:30' },
  { offsetMinutes: 660, label: 'UTC+11:00' },
  { offsetMinutes: 720, label: 'UTC+12:00' },
  { offsetMinutes: 765, label: 'UTC+12:45' },
  { offsetMinutes: 780, label: 'UTC+13:00' },
  { offsetMinutes: 840, label: 'UTC+14:00' },
]

export function timezoneLabel(offsetMinutes: number): string {
  const match = TIMEZONE_OPTIONS.find((o) => o.offsetMinutes === offsetMinutes)
  if (match) return match.label
  const sign = offsetMinutes < 0 ? '-' : '+'
  const abs = Math.abs(offsetMinutes)
  const h = String(Math.floor(abs / 60)).padStart(2, '0')
  const m = String(abs % 60).padStart(2, '0')
  return `UTC${sign}${h}:${m}`
}

interface TimezoneContextValue {
  offsetMinutes: number
  label: string
  setOffsetMinutes: (minutes: number) => void
}

const TimezoneContext = createContext<TimezoneContextValue | null>(null)

function loadInitialOffset(): number {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (raw === null) return 0
  const n = Number(raw)
  return isNaN(n) ? 0 : n
}

export function TimezoneProvider({ children }: { children: ReactNode }) {
  const [offsetMinutes, setOffsetMinutesState] = useState<number>(loadInitialOffset)

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, String(offsetMinutes))
  }, [offsetMinutes])

  const setOffsetMinutes = useCallback((minutes: number) => setOffsetMinutesState(minutes), [])

  return (
    <TimezoneContext.Provider value={{ offsetMinutes, label: timezoneLabel(offsetMinutes), setOffsetMinutes }}>
      {children}
    </TimezoneContext.Provider>
  )
}

/** Global display timezone (a UTC/GMT offset the person picks in Settings). Every
 *  timestamp shown in the app is formatted using this offset, applied to the
 *  underlying UTC epoch-ms value — the stored data itself is never mutated. */
export function useTimezone(): TimezoneContextValue {
  const ctx = useContext(TimezoneContext)
  if (!ctx) throw new Error('useTimezone must be used within a TimezoneProvider')
  return ctx
}
