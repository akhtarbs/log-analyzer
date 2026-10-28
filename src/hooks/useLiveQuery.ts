import { useEffect, useState, useRef } from 'react'
import { liveQuery } from 'dexie'

/** Thin wrapper around Dexie's liveQuery so components re-render on DB writes. */
export function useLiveQuery<T>(querier: () => Promise<T>, deps: unknown[], initial: T): T {
  const [value, setValue] = useState<T>(initial)
  const querierRef = useRef(querier)
  querierRef.current = querier

  useEffect(() => {
    const sub = liveQuery(() => querierRef.current()).subscribe({
      next: (v) => setValue(v),
      error: (err) => console.error('useLiveQuery error', err),
    })
    return () => sub.unsubscribe()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  return value
}
