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
      <div className="flex h-screen w-screen items-center justify-center bg-[#0a0e14] text-[#7d8ea3] text-sm">
        Initializing local database…
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
