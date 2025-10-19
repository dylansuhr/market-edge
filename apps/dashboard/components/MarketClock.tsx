"use client"

import { useEffect, useMemo, useState } from 'react'

const MARKET_OPEN_MINUTES = 9 * 60 + 30 // 9:30 AM ET
const MARKET_CLOSE_MINUTES = 16 * 60 // 4:00 PM ET

type MarketStatus = 'open' | 'closed'

function getEtDate(base?: Date) {
  const now = base ?? new Date()
  return new Date(
    now.toLocaleString('en-US', {
      timeZone: 'America/New_York'
    })
  )
}

function minutesSinceMidnight(date: Date) {
  return date.getHours() * 60 + date.getMinutes() + date.getSeconds() / 60
}

function isBusinessDay(date: Date) {
  const day = date.getDay()
  return day >= 1 && day <= 5
}

function nextBusinessDay(date: Date) {
  const next = new Date(date)
  next.setDate(next.getDate() + 1)
  next.setHours(0, 0, 0, 0)
  while (!isBusinessDay(next)) {
    next.setDate(next.getDate() + 1)
  }
  return next
}

function buildMarketWindows(reference: Date) {
  const open = new Date(reference)
  open.setHours(0, 0, 0, 0)
  open.setMinutes(MARKET_OPEN_MINUTES, 0, 0)

  const close = new Date(reference)
  close.setHours(0, 0, 0, 0)
  close.setMinutes(MARKET_CLOSE_MINUTES, 0, 0)

  return { open, close }
}

function computeStatus(nowEt: Date) {
  const inSession = isBusinessDay(nowEt)
  const { open, close } = buildMarketWindows(nowEt)
  const minutes = minutesSinceMidnight(nowEt)

  if (inSession && minutes >= MARKET_OPEN_MINUTES && minutes < MARKET_CLOSE_MINUTES) {
    return {
      status: 'open' as MarketStatus,
      nextEventLabel: 'Closes in',
      target: close
    }
  }

  let nextOpenDate: Date

  if (inSession && minutes >= MARKET_CLOSE_MINUTES) {
    nextOpenDate = buildMarketWindows(nextBusinessDay(nowEt)).open
  } else if (inSession && minutes < MARKET_OPEN_MINUTES) {
    nextOpenDate = open
  } else {
    nextOpenDate = buildMarketWindows(nextBusinessDay(nowEt)).open
  }

  return {
    status: 'closed' as MarketStatus,
    nextEventLabel: 'Opens in',
    target: nextOpenDate
  }
}

function formatCountdown(target: Date, now: Date) {
  const diffMs = target.getTime() - now.getTime()
  if (diffMs <= 0) {
    return 'Now'
  }

  const totalMinutes = Math.floor(diffMs / (60 * 1000))
  const days = Math.floor(totalMinutes / (60 * 24))
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60)
  const minutes = totalMinutes % 60

  const segments = []
  if (days > 0) segments.push(`${days}d`)
  if (hours > 0) segments.push(`${hours}h`)
  segments.push(`${minutes}m`)

  return segments.join(' ')
}

export function MarketClock() {
  const [now, setNow] = useState<Date | null>(null)

  useEffect(() => {
    setNow(getEtDate())
    const interval = setInterval(() => {
      setNow(getEtDate())
    }, 1000)
    return () => clearInterval(interval)
  }, [])

  const statusInfo = useMemo(() => (now ? computeStatus(now) : null), [now])

  if (!now || !statusInfo) {
    return (
      <div className="flex flex-col md:flex-row md:items-center md:gap-4 text-xs md:text-sm text-gray-400">
        <span>Loading ET clock…</span>
      </div>
    )
  }

  const timeString = now.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit'
  })

  const dateString = now.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric'
  })

  const statusColor =
    statusInfo.status === 'open'
      ? 'text-green-600 bg-green-100'
      : 'text-gray-600 bg-gray-100'

  const countdown = formatCountdown(statusInfo.target, now)

  return (
    <div className="flex flex-col items-start gap-2 text-xs text-slate-500 md:flex-row md:items-center md:gap-4 md:text-sm">
      <div className="flex flex-col md:flex-row md:items-center md:gap-2">
        <span className="font-semibold text-slate-800">{timeString}</span>
        <span>{dateString}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className={`px-2 py-1 rounded-full ${statusColor} text-xs font-medium`}>
          {statusInfo.status === 'open' ? 'Market Open' : 'Market Closed'}
        </span>
        <span>{statusInfo.nextEventLabel} {countdown}</span>
      </div>
    </div>
  )
}
