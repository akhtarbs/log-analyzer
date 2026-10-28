import { useState } from 'react'
import { Menu, Sun, Moon, Laptop, Info } from 'lucide-react'
import { useTheme } from '../../hooks/useTheme'
import { cn } from '../../utils/cn'

export function Header({ onToggleSidebar }: { onToggleSidebar: () => void }) {
  const { theme, setTheme } = useTheme()
  const [showTip, setShowTip] = useState(false)

  return (
    <header className="flex items-center justify-between h-14 px-4 border-b border-[color:var(--color-border)] bg-[color:var(--color-bg-raised)]">
      <div className="flex items-center gap-3">
        <button
          onClick={onToggleSidebar}
          className="rounded-md p-2 text-[color:var(--color-text-muted)] hover:bg-[color:var(--color-surface-hover)] hover:text-[color:var(--color-text)] md:hidden"
          aria-label="Toggle sidebar"
        >
          <Menu size={18} />
        </button>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative">
          <button
            onMouseEnter={() => setShowTip(true)}
            onMouseLeave={() => setShowTip(false)}
            onClick={() => setShowTip((s) => !s)}
            className="flex items-center gap-1.5 rounded-full border border-[color:var(--color-border-strong)] bg-[color:var(--color-surface)] px-3 py-1 text-xs font-medium text-[color:var(--color-text-muted)]"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-[color:var(--color-benign)]" />
            LOCAL MODE
            <Info size={12} />
          </button>
          {showTip && (
            <div className="absolute right-0 mt-2 w-64 rounded-md border border-[color:var(--color-border-strong)] bg-[color:var(--color-surface)] p-3 text-xs text-[color:var(--color-text-muted)] shadow-xl z-50">
              All logs are processed locally in your browser. No log data is uploaded to a server.
            </div>
          )}
        </div>

        <div className="flex items-center rounded-md border border-[color:var(--color-border-strong)] bg-[color:var(--color-surface)] p-0.5">
          {(['dark', 'light', 'system'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTheme(t)}
              className={cn(
                'rounded p-1.5 text-[color:var(--color-text-muted)]',
                theme === t && 'bg-[color:var(--color-accent)]/15 text-[color:var(--color-accent-strong)]',
              )}
              aria-label={`${t} theme`}
              title={`${t} theme`}
            >
              {t === 'dark' && <Moon size={14} />}
              {t === 'light' && <Sun size={14} />}
              {t === 'system' && <Laptop size={14} />}
            </button>
          ))}
        </div>
      </div>
    </header>
  )
}
