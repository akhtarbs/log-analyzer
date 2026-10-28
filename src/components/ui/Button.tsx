import type { ButtonHTMLAttributes } from 'react'
import { cn } from '../../utils/cn'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md'
}

const VARIANTS: Record<string, string> = {
  primary: 'bg-[color:var(--color-accent)] text-[#031317] hover:bg-[color:var(--color-accent-strong)] font-semibold',
  secondary: 'bg-[color:var(--color-surface)] text-[color:var(--color-text)] border border-[color:var(--color-border-strong)] hover:bg-[color:var(--color-surface-hover)]',
  ghost: 'bg-transparent text-[color:var(--color-text-muted)] hover:text-[color:var(--color-text)] hover:bg-[color:var(--color-surface-hover)]',
  danger: 'bg-[color:var(--color-critical)]/15 text-[color:var(--color-critical)] border border-[color:var(--color-critical)]/40 hover:bg-[color:var(--color-critical)]/25',
}

const SIZES: Record<string, string> = {
  sm: 'text-xs px-2.5 py-1.5 gap-1.5',
  md: 'text-sm px-3.5 py-2 gap-2',
}

export function Button({ variant = 'secondary', size = 'md', className, ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center rounded-md transition-colors disabled:opacity-40 disabled:cursor-not-allowed',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...props}
    />
  )
}
