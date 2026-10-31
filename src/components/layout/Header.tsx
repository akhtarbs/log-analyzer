import { useState } from 'react'
import { Menu, Sun, Moon, Laptop, Info, ShieldCheck } from 'lucide-react'
import { useTheme } from '../../hooks/useTheme'
import { cn } from '../../utils/cn'

const THEMES = ['dark', 'light', 'system'] as const

export function Header({ onToggleSidebar }: { onToggleSidebar: () => void }) {
  const { theme, setTheme } = useTheme()
  const [showTip, setShowTip] = useState(false)

  return (
    <header className="glass-bar sticky top-0 z-30 flex h-16 items-center justify-between gap-4 border-b px-4">
      <div className="flex items-center gap-3">
        <button
          onClick={onToggleSidebar}
          className="rounded-lg p-2 text-[color:var(--color-text-muted)] transition-colors hover:bg-[color:var(--color-surface-hover)] hover:text-[color:var(--color-text)] md:hidden"
          aria-label="Toggle sidebar"
        >
          <Menu size={18} />
        </button>

        <div className="hidden items-center gap-2 sm:flex">
          <span className="eyebrow">Security operations</span>
          <span className="h-1 w-1 rounded-full bg-[color:var(--color-border-strong)]" />
          <span className="text-xs text-[color:var(--color-text-faint)]">Browser-local analysis</span>
        </div>
      </div>

      <div className="flex items-center gap-2.5">
        <div className="relative">
          <button
            onMouseEnter={() => setShowTip(true)}
            onMouseLeave={() => setShowTip(false)}
            onClick={() => setShowTip((s) => !s)}
            className="chip"
            aria-expanded={showTip}
          >
            <ShieldCheck size={13} className="text-[color:var(--color-benign)]" />
            <span className="hidden sm:inline">Local mode</span>
            <Info size={12} className="opacity-70" />
          </button>
          {showTip && (
            <div className="panel absolute right-0 z-50 mt-2 w-72 p-3.5 text-xs leading-relaxed text-[color:var(--color-text-muted)]">
              <p className="mb-1 font-semibold text-[color:var(--color-text)]">Nothing leaves this device</p>
              All logs are parsed and stored in your browser&apos;s IndexedDB. No log data is uploaded to a server.
            </div>
          )}
        </div>

        <div className="flex items-center gap-0.5 rounded-full border border-[color:var(--color-border-strong)] bg-[color:var(--color-surface)]/70 p-1">
          {THEMES.map((t) => (
            <button
              key={t}
              onClick={() => setTheme(t)}
              className={cn(
                'rounded-full p-1.5 text-[color:var(--color-text-faint)] transition-colors hover:text-[color:var(--color-text)]',
                theme === t &&
                  'bg-[color:var(--color-accent)]/18 text-[color:var(--color-accent-strong)] shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--color-accent)_35%,transparent)]',
              )}
              aria-label={`${t} theme`}
              title={`${t} theme`}
            >
              {t === 'dark' && <Moon size={13} />}
              {t === 'light' && <Sun size={13} />}
              {t === 'system' && <Laptop size={13} />}
            </button>
          ))}
        </div>
      </div>
    </header>
  )
}
