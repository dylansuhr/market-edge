import { ReactNode } from 'react'
import { cn } from '@/lib/cn'

interface StatusBadgeProps {
  tone?: 'default' | 'positive' | 'negative' | 'warning' | 'info' | 'muted'
  children: ReactNode
  className?: string
}

const toneMap: Record<NonNullable<StatusBadgeProps['tone']>, string> = {
  default: 'bg-brand-muted text-brand',
  positive: 'bg-emerald-100 text-emerald-600',
  negative: 'bg-rose-100 text-rose-600',
  warning: 'bg-amber-100 text-amber-600',
  info: 'bg-slate-100 text-slate-600',
  muted: 'bg-slate-100 text-slate-500'
}

export function StatusBadge({ tone = 'default', children, className }: StatusBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide',
        toneMap[tone],
        className
      )}
    >
      {children}
    </span>
  )
}
