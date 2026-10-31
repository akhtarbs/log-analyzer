import { useState, type ReactNode } from 'react'
import { Sidebar } from './Sidebar'
import { Header } from './Header'
import { ProgressBar } from './ProgressBar'

export function AppShell({ children }: { children: ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <div className="relative flex h-screen w-screen overflow-hidden bg-[color:var(--color-bg)] text-[color:var(--color-text)]">
      <div className="ambient" aria-hidden />
      <div className="rise-in relative flex h-full w-full overflow-hidden">
        <ProgressBar />

        <div className="hidden md:block">
          <Sidebar />
        </div>

        {mobileOpen && (
          <div className="fixed inset-0 z-40 md:hidden">
            <div
              className="absolute inset-0 bg-[color:var(--color-bg)]/70 backdrop-blur-sm"
              onClick={() => setMobileOpen(false)}
            />
            <div className="absolute inset-y-0 left-0 shadow-2xl">
              <Sidebar onNavigate={() => setMobileOpen(false)} />
            </div>
          </div>
        )}

        <div className="relative flex min-w-0 flex-1 flex-col">
          <Header onToggleSidebar={() => setMobileOpen((v) => !v)} />
          <main className="flex-1 overflow-auto">{children}</main>
        </div>
      </div>
    </div>
  )
}
