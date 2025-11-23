import { ReactNode } from 'react'
import { cn } from '@/lib/cn'

interface MetricStatProps {
  label: ReactNode
  value: ReactNode
  description?: ReactNode
  tone?: 'default' | 'positive' | 'negative' | 'muted'
  className?: string
}

const toneClasses: Record<NonNullable<MetricStatProps['tone']>, string> = {
  default: 'text-slate-800',
  positive: 'text-emerald-500',
  negative: 'text-rose-500',
  muted: 'text-slate-500'
}

export function MetricStat({ label, value, description, tone = 'default', className }: MetricStatProps) {
  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <span className="text-sm uppercase tracking-wide text-slate-400">
        {label}
      </span>
      <span className={cn('text-2xl font-semibold', toneClasses[tone])}>{value}</span>
      {description ? <span className="text-xs text-slate-500">{description}</span> : null}
    </div>
  )
}
