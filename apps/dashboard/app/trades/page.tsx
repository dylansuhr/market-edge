'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

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
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Trade History</h1>
            <p className="text-gray-600 mt-1">Raw trade log for the reinforcement-learning agent</p>
          </div>

          <button
            onClick={() => resetAndFetch()}
            disabled={loading}
            className={`px-4 py-2 bg-blue-600 text-white rounded ${loading ? 'opacity-70 cursor-not-allowed' : 'hover:bg-blue-700'}`}
          >
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>

        <form
          onSubmit={applyFilters}
          className="bg-white rounded-lg shadow p-4 mb-6 grid gap-4 md:grid-cols-4"
        >
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase mb-1" htmlFor="symbol">
              Symbol
            </label>
            <input
              id="symbol"
              type="text"
              value={symbolFilter}
              onChange={e => setSymbolFilter(e.target.value)}
              className="w-full border rounded px-3 py-2 text-sm"
              placeholder="AAPL"
            />
          </div>

 			    <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase mb-1" htmlFor="action">
              Action
            </label>
            <select
              id="action"
              value={actionFilter}
              onChange={e => setActionFilter(e.target.value as ActionFilter)}
              className="w-full border rounded px-3 py-2 text-sm"
            >
              <option value="all">All</option>
              <option value="BUY">BUY</option>
              <option value="SELL">SELL</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase mb-1" htmlFor="from">
              From
            </label>
            <input
              id="from"
              type="date"
              value={fromDate}
              onChange={e => setFromDate(e.target.value)}
              className="w-full border rounded px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase mb-1" htmlFor="to">
              To
            </label>
            <input
              id="to"
              type="date"
              value={toDate}
              onChange={e => setToDate(e.target.value)}
              className="w-full border rounded px-3 py-2 text-sm"
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
              className="px-4 py-2 border border-gray-300 rounded text-sm"
            >
              Clear
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-gray-900 text-white rounded text-sm"
            >
              Apply Filters
            </button>
          </div>
        </form>

        <div className="bg-white rounded-lg shadow overflow-hidden">
          {error ? (
            <div className="p-8 text-center text-red-600">{error}</div>
          ) : loading && trades.length === 0 ? (
            <div className="p-8 text-center text-gray-600">Loading trades...</div>
          ) : trades.length === 0 ? (
            <div className="p-8 text-center text-gray-600">
              No trades match the current filters.
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Time</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Symbol</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Action</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Qty</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Price</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">P&amp;L</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Strategy</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Reasoning</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {trades.map(trade => (
                      <tr key={trade.trade_id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-sm text-gray-600">
                          {new Date(trade.executed_at).toLocaleString()}
                        </td>
                        <td className="px-4 py-3">
                          <Link href={`/stocks/${trade.symbol}`} className="font-semibold text-blue-600 hover:underline">
                            {trade.symbol}
                          </Link>
                          <div className="text-xs text-gray-500">{trade.name}</div>
                        </td>
                        <td className={`px-4 py-3 font-semibold ${trade.action === 'BUY' ? 'text-green-600' : 'text-red-600'}`}>
                          {trade.action}
                        </td>
                        <td className="px-4 py-3 text-sm">{trade.quantity}</td>
                        <td className="px-4 py-3 text-sm">${parseFloat(trade.price).toFixed(2)}</td>
                        <td className={`px-4 py-3 text-sm font-semibold ${parseFloat(trade.profit_loss || '0') >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {trade.profit_loss ? `$${parseFloat(trade.profit_loss).toFixed(2)}` : '-'}
                        </td>
                        <td className="px-4 py-3 text-sm">{trade.strategy || '-'}</td>
                        <td className="px-4 py-3 text-sm text-gray-700 max-w-md">
                          {trade.reasoning || '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {nextCursor && (
                <div className="border-t px-4 py-3 flex justify-center bg-gray-50">
                  <button
                    onClick={loadMore}
                    disabled={loadingMore}
                    className={`px-4 py-2 bg-gray-800 text-white rounded ${loadingMore ? 'opacity-70 cursor-not-allowed' : 'hover:bg-gray-900'}`}
                  >
                    {loadingMore ? 'Loading...' : 'Load More'}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
