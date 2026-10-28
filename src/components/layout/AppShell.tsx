import { useState, type ReactNode } from 'react'
import { Sidebar } from './Sidebar'
import { Header } from './Header'
import { ProgressBar } from './ProgressBar'

export function AppShell({ children }: { children: ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[color:var(--color-bg)] text-[color:var(--color-text)]">
      <ProgressBar />

      <div className="hidden md:block">
        <Sidebar />
      </div>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setMobileOpen(false)} />
          <div className="absolute inset-y-0 left-0">
            <Sidebar onNavigate={() => setMobileOpen(false)} />
          </div>
        </div>
      )}

      <div className="flex flex-1 flex-col min-w-0">
        <Header onToggleSidebar={() => setMobileOpen((v) => !v)} />
        <main className="flex-1 overflow-auto">{children}</main>
      </div>
    </div>
  )
}
