import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChartColumn } from 'lucide-react'
import type { MergedStats } from '../analysis/aggregate'
import { buildFindings, type Finding } from '../analysis/findings'
import { buildSummary } from '../analysis/presentation'
import { FindingsCard } from '../components/analysis/FindingsCard'
import { IndicatorsCard } from '../components/analysis/IndicatorsCard'
import { SummaryCards } from '../components/analysis/SummaryCards'
import { TimelineCard } from '../components/analysis/TimelineCard'
import { useTimezone } from '../hooks/useTimezone'
import { openInExplorer, timeRangeTarget, type ExplorerTarget } from '../services/explorerTarget'
import { isCancelled, startTask } from '../services/progress'
import { countMarkedActive, ensureStats, getMergedActiveStats } from '../services/statsService'
import { formatDuration, formatTimestamp } from '../utils/format'

export function Analysis() {
  const navigate = useNavigate()
  const { offsetMinutes } = useTimezone()

  const [data, setData] = useState<{ merged: MergedStats; marked: number } | null>(null)
  const [cancelled, setCancelled] = useState(false)
  const [computeMs, setComputeMs] = useState<number | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    const task = startTask('Loading analysis', { cancellable: true })
    let stale = false

    const run = async () => {
      setCancelled(false)
      try {
        // Instant when statistics already exist; files imported before they were stored are scanned once.
        await ensureStats(task)
        const [merged, marked] = await Promise.all([getMergedActiveStats(), countMarkedActive()])
        if (stale) return
        setData({ merged, marked })
        setComputeMs(task.finish())
      } catch (e) {
        if (!isCancelled(e)) throw e
        if (!stale) setCancelled(true)
      } finally {
        task.finish()
      }
    }
    run()

    return () => {
      stale = true
      task.cancel()
    }
  }, [reloadKey])

  const summary = useMemo(() => (data ? buildSummary(data.merged, data.marked) : null), [data])
  const findings: Finding[] | null = useMemo(
    () =>
      data
        ? buildFindings(data.merged, {
            offsetMinutes,
            formatTime: (ms) => formatTimestamp(ms, offsetMinutes).slice(5, 16),
          })
        : null,
    [data, offsetMinutes],
  )

  const open = (t: ExplorerTarget) => openInExplorer(navigate, t)

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-baseline justify-between gap-3">
        <h1 className="text-lg font-bold flex items-center gap-2">
          <ChartColumn size={18} className="text-[color:var(--color-accent)]" /> Analysis
        </h1>
        {computeMs !== null && !cancelled && (
          <p className="text-[10px] text-[color:var(--color-text-faint)] font-mono-tabular">Computed in {formatDuration(computeMs)}</p>
        )}
      </div>

      {cancelled && (
        <div className="flex items-center justify-between rounded-md border border-[color:var(--color-medium)]/30 bg-[color:var(--color-medium)]/8 px-3 py-2 text-xs text-[color:var(--color-medium)]">
          <span>Analysis cancelled — results are incomplete.</span>
          <button onClick={() => setReloadKey((k) => k + 1)} className="underline shrink-0 ml-3">Retry</button>
        </div>
      )}

      {data && data.merged.totalEvents === 0 ? (
        <div className="rounded-xl border border-dashed border-[color:var(--color-border-strong)] p-10 text-center text-sm text-[color:var(--color-text-faint)]">
          No events in the included files. Import a log or include a file in the Log Explorer to see the analysis.
        </div>
      ) : (
        <>
          <SummaryCards summary={summary} />
          <FindingsCard findings={findings} onOpen={(f) => f.target && open(f.target)} />
          <TimelineCard merged={data?.merged ?? null} offsetMinutes={offsetMinutes} onOpenRange={(s, e) => open(timeRangeTarget(s, e))} />
          <IndicatorsCard merged={data?.merged ?? null} offsetMinutes={offsetMinutes} onOpenTarget={open} />
        </>
      )}
    </div>
  )
}
