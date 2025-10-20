import { ReactNode } from 'react'
import { cn } from '@/lib/cn'

interface SurfaceCardProps {
  children: ReactNode
  className?: string
  padding?: 'sm' | 'md' | 'lg'
}

const paddingMap = {
  sm: 'p-4',
  md: 'p-6',
  lg: 'p-8'
}

export function SurfaceCard({ children, className, padding = 'md' }: SurfaceCardProps) {
  return (
    <div className={cn('card-surface', paddingMap[padding], className)}>
      {children}
    </div>
  )
}
