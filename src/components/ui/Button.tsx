import type { ButtonHTMLAttributes } from 'react'
import { cn } from '../../utils/cn'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md'
}

const VARIANTS: Record<string, string> = {
  primary:
    'text-white font-semibold border border-transparent bg-[linear-gradient(120deg,#6d8bff,#8b7bff_46%,#22d3ee)] shadow-[0_10px_26px_-12px_rgba(109,139,255,0.9)] hover:brightness-110 hover:shadow-[0_12px_30px_-10px_rgba(109,139,255,0.95)]',
  secondary:
    'bg-[color:var(--color-surface)]/70 text-[color:var(--color-text)] border border-[color:var(--color-border-strong)]/80 hover:border-[color:var(--color-accent)]/50 hover:bg-[color:var(--color-surface-hover)] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]',
  ghost:
    'bg-transparent text-[color:var(--color-text-muted)] hover:text-[color:var(--color-text)] hover:bg-[color:var(--color-surface-hover)]/80',
  danger:
    'bg-[color:var(--color-critical)]/12 text-[color:var(--color-critical)] border border-[color:var(--color-critical)]/40 hover:bg-[color:var(--color-critical)]/22',
}

const SIZES: Record<string, string> = {
  sm: 'text-xs px-2.5 py-1.5 gap-1.5 rounded-lg',
  md: 'text-sm px-3.5 py-2 gap-2 rounded-lg',
}

export function Button({ variant = 'secondary', size = 'md', className, ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...props}
    />
  )
}
