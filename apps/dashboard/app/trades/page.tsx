'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { formatCurrency } from '@/lib/format'
import { tooltips } from '@/lib/tooltips'
import { InfoTooltip } from '@/components/ui/InfoTooltip'
import { SurfaceCard } from '@/components/ui/SurfaceCard'
import { StatusBadge } from '@/components/ui/StatusBadge'

const PAGE_SIZE = 50

type Trade = {
  trade_id: number
  symbol: string
  name: string
  action: 'BUY' | 'SELL'
  quantity: number
  price: string
  strategy: string | null
  reasoning: string | null
  profit_loss: string | null
  executed_at: string
  exit_price: string | null
  status: string
}

type ActionFilter = 'all' | 'BUY' | 'SELL'

export default function TradesPage() {
  const [trades, setTrades] = useState<Trade[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [symbolFilter, setSymbolFilter] = useState('')
  const [actionFilter, setActionFilter] = useState<ActionFilter>('all')
  const [fromDate, setFromDate] = useState<string>('')
  const [toDate, setToDate] = useState<string>('')
  const [nextCursor, setNextCursor] = useState<number | null>(null)

  useEffect(() => {
    resetAndFetch()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function requestTrades(cursor?: number) {
    const params = new URLSearchParams({
      limit: PAGE_SIZE.toString()
    })

    if (symbolFilter.trim()) {
      params.set('symbol', symbolFilter.trim().toUpperCase())
    }
    if (actionFilter !== 'all') {
      params.set('action', actionFilter)
    }
    if (fromDate) {
      params.set('from', new Date(fromDate).toISOString())
    }
    if (toDate) {
      // inclusive day: add 1 day? Instead, set to EOD by Date to end-of-day. We can use toDate with 23:59 by appending 'T23:59:59'
      const end = new Date(toDate)
      end.setHours(23, 59, 59, 999)
      params.set('to', end.toISOString())
    }
    if (cursor) {
      params.set('cursor', cursor.toString())
    }

    const res = await fetch(`/api/trades?${params.toString()}`, { cache: 'no-store' })
    if (!res.ok) {
      throw new Error(`Failed to fetch trades (${res.status})`)
    }

    return res.json()
  }

  async function resetAndFetch() {
    setLoading(true)
    setError(null)
    try {
      const data = await requestTrades()
      setTrades(data.trades || [])
      setNextCursor(typeof data.nextCursor === 'number' ? data.nextCursor : null)
    } catch (err) {
      console.error(err)
      setError('Failed to load trades. Please try again.')
      setTrades([])
      setNextCursor(null)
    } finally {
      setLoading(false)
    }
  }

  async function applyFilters(event?: React.FormEvent) {
    event?.preventDefault()
    await resetAndFetch()
  }

  async function loadMore() {
    if (!nextCursor || loadingMore) return
    setLoadingMore(true)
    try {
      const data = await requestTrades(nextCursor)
      setTrades(prev => [...prev, ...(data.trades || [])])
      setNextCursor(typeof data.nextCursor === 'number' ? data.nextCursor : null)
    } catch (err) {
      console.error(err)
      setError('Failed to load more trades.')
    } finally {
      setLoadingMore(false)
    }
  }

  return (
    <div className="min-h-screen bg-brand-background p-6 md:p-10">
      <div className="mx-auto flex max-w-7xl flex-col gap-8">
        <SurfaceCard
          padding="lg"
          className="flex flex-col gap-4 bg-brand-gradient text-white md:flex-row md:items-center md:justify-between"
        >
          <div>
            <h1 className="text-3xl font-semibold">Trade History</h1>
            <p className="mt-2 text-sm text-white/80">Raw trade log for the reinforcement-learning agent</p>
          </div>

          <button
            onClick={() => resetAndFetch()}
            disabled={loading}
            className={`rounded-full px-5 py-2 text-sm font-semibold shadow ${loading ? 'cursor-not-allowed bg-white/30 text-white/80' : 'bg-white text-brand hover:bg-brand-muted hover:text-brand'}`}
          >
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>
        </SurfaceCard>

        <SurfaceCard className="mb-6" padding="lg">
          <form
            onSubmit={applyFilters}
            className="grid gap-4 md:grid-cols-4"
          >
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400" htmlFor="symbol">
              Symbol
            </label>
            <input
              id="symbol"
              type="text"
              value={symbolFilter}
              onChange={e => setSymbolFilter(e.target.value)}
              className="w-full rounded-full border border-brand-muted px-4 py-2 text-sm focus:border-brand focus:outline-none"
              placeholder="AAPL"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400" htmlFor="action">
              Action
            </label>
            <select
              id="action"
              value={actionFilter}
              onChange={e => setActionFilter(e.target.value as ActionFilter)}
              className="w-full rounded-full border border-brand-muted px-4 py-2 text-sm focus:border-brand focus:outline-none"
            >
              <option value="all">All</option>
              <option value="BUY">BUY</option>
              <option value="SELL">SELL</option>
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400" htmlFor="from">
              From
            </label>
            <input
              id="from"
              type="date"
              value={fromDate}
              onChange={e => setFromDate(e.target.value)}
              className="w-full rounded-full border border-brand-muted px-4 py-2 text-sm focus:border-brand focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400" htmlFor="to">
              To
            </label>
            <input
              id="to"
              type="date"
              value={toDate}
              onChange={e => setToDate(e.target.value)}
              className="w-full rounded-full border border-brand-muted px-4 py-2 text-sm focus:border-brand focus:outline-none"
            />
          </div>

          <div className="md:col-span-4 flex gap-2 justify-end">
            <button
              type="button"
              onClick={() => {
                setSymbolFilter('')
                setActionFilter('all')
                setFromDate('')
                setToDate('')
                resetAndFetch()
              }}
              className="rounded-full border border-brand-muted px-4 py-2 text-sm text-slate-600 hover:border-brand hover:text-brand"
            >
              Clear
            </button>
            <button
              type="submit"
              className="rounded-full bg-brand text-sm font-semibold text-white shadow-sm px-4 py-2 transition hover:bg-brand-light"
            >
              Apply Filters
            </button>
          </div>
          </form>
        </SurfaceCard>

        <SurfaceCard className="overflow-hidden">
          {error ? (
            <div className="p-8 text-center text-red-500">{error}</div>
          ) : loading && trades.length === 0 ? (
            <div className="p-8 text-center text-slate-500">Loading trades...</div>
          ) : trades.length === 0 ? (
            <div className="p-8 text-center text-slate-500">
              No trades match the current filters.
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="border-b border-brand-muted bg-brand-muted/40">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-500">Time</th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-500">Symbol</th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-500 flex items-center">
                        Action
                        <InfoTooltip content={tooltips.tradeAction} position="right" />
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-500">Qty</th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-500 flex items-center">
                        Price
                        <InfoTooltip content={tooltips.tradePrice} position="right" />
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-500 flex items-center">
                        P&amp;L
                        <InfoTooltip content={tooltips.tradePnL} position="right" />
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-500 flex items-center">
                        Strategy
                        <InfoTooltip content={tooltips.strategy} position="right" />
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-500 flex items-center">
                        Reasoning
                        <InfoTooltip content={tooltips.reasoning} position="right" />
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-brand-muted text-sm text-slate-600">
                    {trades.map(trade => (
                      <tr key={trade.trade_id} className="odd:bg-brand-muted/30 transition-colors hover:bg-brand-muted/50">
                        <td className="px-4 py-3 text-sm text-gray-600">
                          {new Date(trade.executed_at).toLocaleString()}
                        </td>
                        <td className="px-4 py-3">
                          <Link href={`/stocks/${trade.symbol}`} className="font-semibold text-brand hover:text-brand-light">
                            {trade.symbol}
                          </Link>
                          <div className="text-xs text-slate-400">{trade.name}</div>
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge tone={trade.action === 'BUY' ? 'positive' : 'negative'}>
                            {trade.action}
                          </StatusBadge>
                        </td>
                        <td className="px-4 py-3 text-sm">{trade.quantity}</td>
                        <td className="px-4 py-3 text-sm">{formatCurrency(trade.price)}</td>
                        <td className={`px-4 py-3 text-sm font-semibold ${parseFloat(trade.profit_loss || '0') >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                          {trade.profit_loss ? formatCurrency(trade.profit_loss) : '-'}
                        </td>
                        <td className="px-4 py-3 text-sm">{trade.strategy || '-'}</td>
                        <td className="px-4 py-3 text-sm text-slate-600 max-w-md">
                          {trade.reasoning || '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {nextCursor && (
                <div className="flex justify-center border-t border-brand-muted bg-brand-muted/40 px-4 py-3">
                  <button
                    onClick={loadMore}
                    disabled={loadingMore}
                    className={`rounded-full px-4 py-2 text-sm font-semibold ${loadingMore ? 'cursor-not-allowed bg-brand-muted text-slate-400' : 'bg-brand text-white hover:bg-brand-light'}`}
                  >
                    {loadingMore ? 'Loading...' : 'Load More'}
                  </button>
                </div>
              )}
            </>
          )}
        </SurfaceCard>
      </div>
    </div>
  )
}
