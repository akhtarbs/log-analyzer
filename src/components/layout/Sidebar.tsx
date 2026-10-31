import { NavLink } from 'react-router-dom'
import { LayoutDashboard, ListTree, ChartColumn, ScanSearch, ShieldAlert, Bookmark, Settings, ShieldCheck } from 'lucide-react'
import { cn } from '../../utils/cn'

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/logs', label: 'Log Explorer', icon: ListTree },
  { to: '/analysis', label: 'Analysis', icon: ChartColumn },
  { to: '/investigations', label: 'Investigations', icon: ScanSearch },
  { to: '/rules', label: 'Rules', icon: ShieldAlert },
  { to: '/filters', label: 'Saved Filters', icon: Bookmark },
  { to: '/settings', label: 'Settings', icon: Settings },
]

export function Sidebar({ collapsed, onNavigate }: { collapsed?: boolean; onNavigate?: () => void }) {
  return (
    <aside
      className={cn(
        'flex h-full flex-col border-r border-[color:var(--color-border)] bg-[color:var(--color-bg-raised)]/85 backdrop-blur-xl',
        collapsed ? 'w-16' : 'w-60',
      )}
    >
      <div className="flex h-16 items-center gap-2.5 border-b border-[color:var(--color-border)] px-4">
        <span className="logo-mark">
          <ShieldCheck size={17} strokeWidth={2.2} />
        </span>
        {!collapsed && (
          <div className="min-w-0">
            <span className="display block text-[13px] font-bold leading-tight tracking-tight text-[color:var(--color-text)]">
              Log Analyzer
            </span>
            <span className="block text-[10px] font-semibold uppercase tracking-[0.18em] text-[color:var(--color-text-faint)]">
              SOC console
            </span>
          </div>
        )}
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-2.5 py-4">
        {!collapsed && <p className="eyebrow px-2 pb-1.5">Workspace</p>}
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            onClick={onNavigate}
            className={({ isActive }) => cn('sidebar-link', isActive && 'sidebar-link-active')}
            title={collapsed ? item.label : undefined}
          >
            {({ isActive }) => (
              <>
                <item.icon
                  size={16}
                  strokeWidth={2}
                  className={cn('shrink-0', isActive && 'text-[color:var(--color-accent-strong)]')}
                />
                {!collapsed && <span>{item.label}</span>}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-[color:var(--color-border)] p-3">
        <div className="flex items-center gap-2 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-surface)]/60 px-2.5 py-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-[color:var(--color-text-muted)]">
          <span className="relative flex h-2 w-2 shrink-0">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[color:var(--color-benign)] opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-[color:var(--color-benign)]" />
          </span>
          {!collapsed && <span className="truncate">Local only</span>}
        </div>
      </div>
    </aside>
  )
}
