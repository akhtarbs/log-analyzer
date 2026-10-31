import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLiveQuery } from '../hooks/useLiveQuery'
import { db } from '../db/database'
import { ensureStats, getDashboardStats, type DashboardStats } from '../services/statsService'
import { Button } from '../components/ui/Button'
import { PageHeader } from '../components/ui/PageHeader'
import { formatDuration, formatNumber, formatTimestamp } from '../utils/format'
import { useTimezone } from '../hooks/useTimezone'
import { generateDemoData } from '../services/demoData'
import { isCancelled, startTask, type TaskHandle } from '../services/progress'
import { Upload, Sparkles, ShieldCheck, LayoutDashboard, Activity, PieChart as PieIcon, Globe } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'

const SEVERITY_COLORS: Record<string, string> = {
  Critical: 'var(--color-critical)',
  High: 'var(--color-high)',
  Medium: 'var(--color-medium)',
  Low: 'var(--color-low)',
}

const TOOLTIP_STYLE = {
  background: 'color-mix(in oklab, var(--color-surface) 96%, transparent)',
  border: '1px solid var(--color-border-strong)',
  borderRadius: 10,
  fontSize: 12,
  color: 'var(--color-text)',
  boxShadow: '0 18px 40px -24px rgba(0,0,0,0.8)',
}

export function Dashboard() {
  const navigate = useNavigate()
  const fileCount = useLiveQuery(() => db.logFiles.count(), [], 0)
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const { offsetMinutes } = useTimezone()

  const [cancelled, setCancelled] = useState(false)
  const [computeMs, setComputeMs] = useState<number | null>(null)
  const runRef = useRef<TaskHandle | null>(null)

  const refresh = useCallback(async () => {
    runRef.current?.cancel() // a newer request supersedes an older scan
    const task = startTask('Loading dashboard', { cancellable: true })
    runRef.current = task
    setLoading(true)
    setCancelled(false)
    try {
      // Instant when statistics already exist; files imported before this feature are scanned once.
      await ensureStats(task)
      const s = await getDashboardStats(offsetMinutes)
      if (runRef.current !== task) return
      setStats(s)
      setComputeMs(task.finish())
    } catch (e) {
      if (!isCancelled(e)) throw e
      if (runRef.current === task) setCancelled(true)
    } finally {
      task.finish()
      if (runRef.current === task) {
        runRef.current = null
        setLoading(false)
      }
    }
  }, [offsetMinutes])

  useEffect(() => {
    refresh()
    return () => runRef.current?.cancel()
  }, [fileCount, refresh])

  const handleDemoData = async () => {
    setGenerating(true)
    await generateDemoData(1000)
    await refresh()
    setGenerating(false)
  }

  if (!loading && stats && stats.totalEvents === 0) {
    return (
      <div className="relative flex h-full items-center justify-center p-6">
        <div className="hero-panel w-full max-w-lg p-8 text-center sm:p-10">
          <span className="logo-mark mx-auto mb-5 h-14 w-14 rounded-2xl">
            <ShieldCheck size={28} strokeWidth={2} />
          </span>
          <p className="eyebrow mb-2">Welcome to the console</p>
          <h1 className="display mb-2 text-2xl font-bold text-[color:var(--color-text)]">
            Make sense of <span className="gradient-text">your server logs</span>
          </h1>
          <p className="mx-auto mb-6 max-w-sm text-sm leading-relaxed text-[color:var(--color-text-muted)]">
            Drop in an access, auth, or syslog file and get severity scoring, timelines and indicators — all on this device.
          </p>
          <ul className="mb-7 grid grid-cols-2 gap-2 text-left text-xs">
            {['No login', 'No cloud', 'No server', 'Runs in-browser'].map((t) => (
              <li
                key={t}
                className="panel-soft flex items-center gap-2 px-3 py-2 font-medium text-[color:var(--color-text-muted)]"
              >
                <span className="text-[color:var(--color-benign)]">✓</span> {t}
              </li>
            ))}
          </ul>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button variant="primary" className="flex-1" onClick={() => navigate('/logs?import=1')}>
              <Upload size={16} /> Import log
            </Button>
            <Button variant="secondary" className="flex-1" onClick={handleDemoData} disabled={generating}>
              <Sparkles size={16} /> {generating ? 'Generating…' : 'Load demo data'}
            </Button>
          </div>
        </div>
      </div>
    )
  }

  const severityData = stats
    ? [
        { name: 'Critical', value: stats.critical },
        { name: 'High', value: stats.high },
        { name: 'Medium', value: stats.medium },
        { name: 'Low', value: stats.low },
      ]
    : []

  const timelineData =
    stats?.timeline.map((t) => {
      const label = formatTimestamp(t.bucket, offsetMinutes)
      return { time: stats.bucketMinutes >= 1440 ? label.slice(0, 10) : label.slice(5, 16), count: t.count }
    }) ?? []

  const topIps = stats?.topSourceIps ?? []

  return (
    <div className="mx-auto max-w-[1500px] space-y-5 p-4 sm:p-6">
      <PageHeader
        eyebrow="Overview"
        title="Dashboard"
        description="A live read on what your collected logs are saying — volume, severity mix, and the noisiest sources."
        icon={LayoutDashboard}
        actions={
          <Button variant="primary" size="sm" onClick={() => navigate('/logs?import=1')}>
            <Upload size={14} /> Import log
          </Button>
        }
      />

      {cancelled && (
        <div className="flex items-center justify-between rounded-lg border border-[color:var(--color-medium)]/35 bg-[color:var(--color-medium)]/10 px-3.5 py-2.5 text-xs text-[color:var(--color-medium)]">
          <span>Calculation cancelled — the figures below may be out of date.</span>
          <button onClick={refresh} className="shrink-0 ml-3 underline">
            Retry
          </button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Total events" value={stats ? formatNumber(stats.totalEvents) : '—'} accent="var(--color-accent)" icon={Activity} />
        <StatCard label="Critical" value={stats ? formatNumber(stats.critical) : '—'} accent="var(--color-critical)" />
        <StatCard label="High" value={stats ? formatNumber(stats.high) : '—'} accent="var(--color-high)" />
        <StatCard label="Marked" value={stats ? formatNumber(stats.marked) : '—'} accent="var(--color-violet)" />
      </div>

      {!loading && !cancelled && computeMs !== null && (
        <p className="-mt-2 font-mono-tabular text-[10px] text-[color:var(--color-text-faint)]">
          Computed in {formatDuration(computeMs)}
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <section className="panel p-5 lg:col-span-2">
          <div className="mb-4 flex items-center gap-2">
            <span className="icon-tile h-7 w-7 rounded-lg">
              <Activity size={14} />
            </span>
            <h2 className="text-sm font-semibold text-[color:var(--color-text)]">Event timeline</h2>
          </div>
          <ResponsiveContainer width="100%" height={230}>
            <BarChart data={timelineData}>
              <defs>
                <linearGradient id="barAurora" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#8b7bff" stopOpacity={1} />
                  <stop offset="100%" stopColor="#22d3ee" stopOpacity={0.5} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="time"
                tick={{ fontSize: 10, fill: 'var(--color-text-faint)' }}
                interval="preserveStartEnd"
                axisLine={false}
                tickLine={false}
              />
              <YAxis tick={{ fontSize: 10, fill: 'var(--color-text-faint)' }} width={40} axisLine={false} tickLine={false} />
              <Tooltip cursor={{ fill: 'color-mix(in oklab, var(--color-accent) 8%, transparent)' }} contentStyle={TOOLTIP_STYLE} />
              <Bar dataKey="count" fill="url(#barAurora)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </section>

        <section className="panel p-5">
          <div className="mb-4 flex items-center gap-2">
            <span className="icon-tile h-7 w-7 rounded-lg">
              <PieIcon size={14} />
            </span>
            <h2 className="text-sm font-semibold text-[color:var(--color-text)]">Severity mix</h2>
          </div>
          <ResponsiveContainer width="100%" height={230}>
            <PieChart>
              <Pie
                data={severityData}
                dataKey="value"
                nameKey="name"
                innerRadius={52}
                outerRadius={82}
                paddingAngle={3}
                stroke="none"
              >
                {severityData.map((d) => (
                  <Cell key={d.name} fill={SEVERITY_COLORS[d.name]} />
                ))}
              </Pie>
              <Tooltip contentStyle={TOOLTIP_STYLE} />
            </PieChart>
          </ResponsiveContainer>
          <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5">
            {severityData.map((d) => (
              <div key={d.name} className="flex items-center gap-1.5 text-[11px] text-[color:var(--color-text-muted)]">
                <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: SEVERITY_COLORS[d.name] }} />
                <span className="flex-1">{d.name}</span>
                <span className="font-mono-tabular text-[color:var(--color-text)]">{formatNumber(d.value)}</span>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="panel p-5">
        <div className="mb-4 flex items-center gap-2">
          <span className="icon-tile h-7 w-7 rounded-lg">
            <Globe size={14} />
          </span>
          <h2 className="text-sm font-semibold text-[color:var(--color-text)]">Top source IPs</h2>
        </div>
        <div className="space-y-2">
          {topIps.map((ip, i) => (
            <button
              key={ip.key}
              onClick={() => navigate(`/logs?search=${ip.key}`)}
              className="group flex w-full items-center gap-3 rounded-lg px-1.5 py-1 text-left transition-colors hover:bg-[color:var(--color-surface-hover)]/60"
            >
              <span className="w-5 shrink-0 font-mono-tabular text-[10px] text-[color:var(--color-text-faint)]">
                {String(i + 1).padStart(2, '0')}
              </span>
              <span className="w-32 shrink-0 truncate font-mono-tabular text-xs text-[color:var(--color-text)] group-hover:text-[color:var(--color-accent-strong)] sm:w-40">
                {ip.key}
              </span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-[color:var(--color-surface)]">
                <div
                  className="h-full rounded-full bg-[image:var(--accent-gradient)] opacity-80 transition-opacity group-hover:opacity-100"
                  style={{ width: `${(ip.count / (topIps[0]?.count || 1)) * 100}%` }}
                />
              </div>
              <span className="w-14 shrink-0 text-right font-mono-tabular text-xs text-[color:var(--color-text-muted)]">
                {formatNumber(ip.count)}
              </span>
            </button>
          ))}
          {topIps.length === 0 && (
            <p className="text-xs text-[color:var(--color-text-faint)]">No source IP data yet.</p>
          )}
        </div>
      </section>
    </div>
  )
}

function StatCard({
  label,
  value,
  accent,
  icon: Icon,
}: {
  label: string
  value: string
  accent: string
  icon?: typeof Activity
}) {
  return (
    <div className="stat-tile" style={{ ['--tile-color' as string]: accent }}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.13em] text-[color:var(--color-text-muted)]">{label}</p>
        {Icon ? (
          <Icon size={14} className="opacity-70" style={{ color: accent }} />
        ) : (
          <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: accent }} />
        )}
      </div>
      <p className="stat-value text-3xl font-bold leading-none">{value}</p>
    </div>
  )
}
