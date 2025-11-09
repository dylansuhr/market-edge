/**
 * InfoTooltip Component
 *
 * A small "i" icon that shows helpful information on hover
 */

'use client'

import { useState, useRef, useEffect } from 'react'

interface InfoTooltipProps {
  content: string
  position?: 'top' | 'bottom' | 'left' | 'right'
}

export function InfoTooltip({ content, position = 'top' }: InfoTooltipProps) {
  const [isVisible, setIsVisible] = useState(false)
  const [adjustedPosition, setAdjustedPosition] = useState(position)
  const tooltipRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const positionSetRef = useRef(false)

  useEffect(() => {
    if (isVisible && tooltipRef.current && buttonRef.current && !positionSetRef.current) {
      const tooltip = tooltipRef.current
      const rect = tooltip.getBoundingClientRect()
      const viewportWidth = window.innerWidth
      const viewportHeight = window.innerHeight
      const margin = 8 // 8px margin from edges

      let newPosition = position

      // Check horizontal overflow
      if (rect.right > viewportWidth - margin) {
        newPosition = 'left'
      } else if (rect.left < margin) {
        newPosition = 'right'
      }

      // Check vertical overflow (prioritize horizontal fixes)
      if (newPosition === position) {
        if (rect.top < margin) {
          newPosition = 'bottom'
        } else if (rect.bottom > viewportHeight - margin) {
          newPosition = 'top'
        }
      }

      if (newPosition !== adjustedPosition) {
        setAdjustedPosition(newPosition)
      }

      // Mark position as set to prevent re-calculation loop
      positionSetRef.current = true
    }

    // Reset when tooltip is hidden
    if (!isVisible) {
      positionSetRef.current = false
      setAdjustedPosition(position)
    }
  }, [isVisible, position, adjustedPosition])

  const positionClasses = {
    top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
    left: 'right-full top-1/2 -translate-y-1/2 mr-2',
    right: 'left-full top-1/2 -translate-y-1/2 ml-2'
  }

  const arrowClasses = {
    top: 'top-full left-1/2 -translate-x-1/2 border-l-transparent border-r-transparent border-b-transparent border-t-slate-800',
    bottom: 'bottom-full left-1/2 -translate-x-1/2 border-l-transparent border-r-transparent border-t-transparent border-b-slate-800',
    left: 'left-full top-1/2 -translate-y-1/2 border-t-transparent border-b-transparent border-r-transparent border-l-slate-800',
    right: 'right-full top-1/2 -translate-y-1/2 border-t-transparent border-b-transparent border-l-transparent border-r-slate-800'
  }

  return (
    <div className="relative inline-block">
      <button
        ref={buttonRef}
        type="button"
        onMouseEnter={() => setIsVisible(true)}
        onMouseLeave={() => setIsVisible(false)}
        onFocus={() => setIsVisible(true)}
        onBlur={() => setIsVisible(false)}
        className="inline-flex items-center justify-center w-4 h-4 text-xs font-semibold text-slate-400 hover:text-slate-600 transition-colors rounded-full border border-slate-300 hover:border-slate-400 bg-white ml-1"
        aria-label="More information"
      >
        i
      </button>

      {isVisible && (
        <div ref={tooltipRef} className={`absolute z-50 ${positionClasses[adjustedPosition]} pointer-events-none`}>
          <div className="bg-slate-800 text-white rounded-lg px-4 py-3 min-w-64 max-w-sm shadow-lg normal-case whitespace-normal" style={{ fontSize: '0.875rem', lineHeight: '1.25rem' }}>
            <p className="normal-case" style={{ fontSize: '0.875rem', lineHeight: '1.5' }}>{content}</p>
          </div>
          <div className={`absolute w-0 h-0 border-4 ${arrowClasses[adjustedPosition]}`} />
        </div>
      )}
    </div>
  )
}
