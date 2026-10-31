import { HashRouter, Routes, Route } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { AppShell } from './components/layout/AppShell'
import { Dashboard } from './pages/Dashboard'
import { LogExplorer } from './pages/LogExplorer'
import { Analysis } from './pages/Analysis'
import { Investigations } from './pages/Investigations'
import { InvestigationDetail } from './pages/InvestigationDetail'
import { Rules } from './pages/Rules'
import { SavedFilters } from './pages/SavedFilters'
import { SettingsPage } from './pages/Settings'
import { initDb } from './db/database'
import { TimezoneProvider } from './hooks/useTimezone'

// HashRouter is used deliberately: GitHub Pages serves static files with no
// server-side rewrite rules, so a BrowserRouter would 404 on refresh for any
// route other than "/". Hash-based routes always resolve to index.html.
export default function App() {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    initDb().then(() => setReady(true))
  }, [])

  if (!ready) {
    return (
      <div className="relative flex h-screen w-screen flex-col items-center justify-center gap-4 overflow-hidden bg-[color:var(--color-bg)]">
        <div className="ambient" aria-hidden />
        <div className="relative flex flex-col items-center gap-3">
          <div className="logo-mark h-12 w-12 rounded-2xl">
            <span className="h-2.5 w-2.5 rounded-full bg-white/90" />
          </div>
          <p className="display text-sm font-semibold tracking-wide text-[color:var(--color-text)]">Local Log Analyzer</p>
          <p className="text-xs text-[color:var(--color-text-muted)]">Initializing local database…</p>
          <div className="mt-1 h-1 w-40 overflow-hidden rounded-full bg-[color:var(--color-surface)]">
            <div className="progress-indeterminate h-full w-1/3 rounded-full bg-[color:var(--color-accent)]" />
          </div>
        </div>
      </div>
    )
  }

  return (
    <HashRouter>
      <TimezoneProvider>
        <AppShell>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/logs" element={<LogExplorer />} />
            <Route path="/analysis" element={<Analysis />} />
            <Route path="/investigations" element={<Investigations />} />
            <Route path="/investigations/:id" element={<InvestigationDetail />} />
            <Route path="/rules" element={<Rules />} />
            <Route path="/filters" element={<SavedFilters />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Routes>
        </AppShell>
      </TimezoneProvider>
    </HashRouter>
  )
}
