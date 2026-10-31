import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

interface PageHeaderProps {
  eyebrow?: string
  title: string
  description?: string
  icon?: LucideIcon
  actions?: ReactNode
}

/**
 * Consistent page heading: a tiny uppercase eyebrow, a display-font title with
 * a gradient icon tile, an optional one-line explanation, and page actions.
 */
export function PageHeader({ eyebrow = 'Workspace', title, description, icon: Icon, actions }: PageHeaderProps) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <div className="mb-2 flex items-center gap-2">
          <span className="eyebrow">{eyebrow}</span>
          <span className="accent-rule w-8 opacity-70" />
        </div>
        <h1 className="display flex items-center gap-2.5 text-[1.45rem] font-bold leading-tight text-[color:var(--color-text)]">
          {Icon && (
            <span className="icon-tile">
              <Icon size={17} />
            </span>
          )}
          <span className="truncate">{title}</span>
        </h1>
        {description && (
          <p className="mt-1.5 max-w-2xl text-[13px] leading-relaxed text-[color:var(--color-text-muted)]">{description}</p>
        )}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  )
}
