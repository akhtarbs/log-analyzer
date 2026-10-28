import { NavLink } from 'react-router-dom'
import { LayoutDashboard, ListTree, ChartColumn, ShieldAlert, SlidersHorizontal, Bookmark, Settings, ScanSearch } from 'lucide-react'
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
        'flex h-full flex-col border-r border-[color:var(--color-border)] bg-[color:var(--color-bg-raised)]',
        collapsed ? 'w-16' : 'w-56',
      )}
    >
      <div className="flex items-center gap-2 px-4 h-14 border-b border-[color:var(--color-border)]">
        <SlidersHorizontal size={18} className="text-[color:var(--color-accent)] shrink-0" />
        {!collapsed && <span className="font-mono-tabular font-bold tracking-tight text-sm">LOG ANALYZER</span>}
      </div>

      <nav className="flex-1 py-3 px-2 space-y-0.5 overflow-y-auto">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-[color:var(--color-accent)]/12 text-[color:var(--color-accent-strong)]'
                  : 'text-[color:var(--color-text-muted)] hover:bg-[color:var(--color-surface-hover)] hover:text-[color:var(--color-text)]',
              )
            }
          >
            <item.icon size={16} className="shrink-0" />
            {!collapsed && <span>{item.label}</span>}
          </NavLink>
        ))}
      </nav>

      <div className="p-3 border-t border-[color:var(--color-border)]">
        <div className="flex items-center gap-2 rounded-md bg-[color:var(--color-surface)] px-2.5 py-2 text-xs">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[color:var(--color-benign)] opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-[color:var(--color-benign)]" />
          </span>
          {!collapsed && <span className="text-[color:var(--color-text-muted)] font-medium">LOCAL MODE</span>}
        </div>
      </div>
    </aside>
  )
}
