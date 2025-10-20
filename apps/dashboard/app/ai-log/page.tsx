'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { SurfaceCard } from '@/components/ui/SurfaceCard'
import { StatusBadge } from '@/components/ui/StatusBadge'

const PAGE_SIZE = 50
type StatusFilter = 'all' | 'executed' | 'skipped' | 'exploration'

interface Decision {
  decision_id: number
  symbol: string
  name: string
  timestamp: string
  state: {
    rsi: number
    price: number
    sma: number
    vwap: number
    position_qty: number
  }
  action: 'BUY' | 'SELL' | 'HOLD'
  was_executed: boolean
  was_random: boolean
  reasoning: string
  q_values: Record<string, number> | null
}

export default function AILogPage() {
  const [decisions, setDecisions] = useState<Decision[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [nextCursor, setNextCursor] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    resetAndFetch()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter])

  async function requestDecisions(cursor?: number) {
    const params = new URLSearchParams({
      limit: PAGE_SIZE.toString(),
      status: statusFilter
    })
    if (cursor) {
      params.set('cursor', cursor.toString())
    }

    const res = await fetch(`/api/ai-log?${params.toString()}`, { cache: 'no-store' })
    if (!res.ok) {
      throw new Error(`Failed to fetch AI decisions (${res.status})`)
    }

    const data = await res.json()
    const normalized: Decision[] = (data.decisions || []).map((d: any) => ({
      ...d,
      state: typeof d.state === 'object' ? d.state : JSON.parse(d.state || '{}'),
      q_values:
        typeof d.q_values === 'object'
          ? d.q_values
          : d.q_values
          ? JSON.parse(d.q_values)
          : null
    }))

    return {
      decisions: normalized,
      nextCursor: typeof data.nextCursor === 'number' ? data.nextCursor : null
    }
  }

  async function resetAndFetch() {
    setLoading(true)
    setError(null)

    try {
      const { decisions: newDecisions, nextCursor } = await requestDecisions()
      setDecisions(newDecisions)
      setNextCursor(nextCursor)
    } catch (err) {
      console.error('Failed to fetch AI logs:', err)
      setError('Failed to load AI decisions. Please try again.')
      setDecisions([])
      setNextCursor(null)
    } finally {
      setLoading(false)
    }
  }

  async function loadMore() {
    if (!nextCursor || loadingMore) return

    setLoadingMore(true)
    setError(null)

    try {
      const { decisions: newDecisions, nextCursor: next } = await requestDecisions(nextCursor)
      setDecisions(prev => [...prev, ...newDecisions])
      setNextCursor(next)
    } catch (err) {
      console.error('Failed to fetch additional AI logs:', err)
      setError('Failed to load more decisions.')
    } finally {
      setLoadingMore(false)
    }
  }

  const actionSummary = decisions.reduce(
    (acc, decision) => {
      acc.total += 1
      if (decision.was_executed) {
        acc.executed += 1
      } else {
        acc.skipped += 1
      }

      if (decision.was_random) {
        acc.exploration += 1
      }

      if (decision.action === 'HOLD') {
        acc.hold += 1
      } else if (decision.action === 'BUY') {
        acc.buy += 1
        if (decision.was_executed) {
          acc.executedBuys += 1
        }
      } else if (decision.action === 'SELL') {
        acc.sell += 1
        if (decision.was_executed) {
          acc.executedSells += 1
        }
      }

      return acc
    },
    {
      total: 0,
      executed: 0,
      skipped: 0,
      exploration: 0,
      hold: 0,
      buy: 0,
      sell: 0,
      executedBuys: 0,
      executedSells: 0
    }
  )

  const totalDecisions = actionSummary.total
  const executedCount = actionSummary.executed
  const skippedCount = actionSummary.skipped
  const explorationCount = actionSummary.exploration
  const holdCount = actionSummary.hold
  const buyCount = actionSummary.buy
  const sellCount = actionSummary.sell

  const now = Date.now()

  function getWindowStats(hours: number) {
    const cutoff = now - hours * 60 * 60 * 1000
    return decisions.reduce(
      (acc, decision) => {
        if (new Date(decision.timestamp).getTime() >= cutoff) {
          acc.total += 1
          if (decision.action === 'HOLD') acc.hold += 1
          if (decision.action === 'BUY') acc.buy += 1
          if (decision.action === 'SELL') acc.sell += 1
        }
        return acc
      },
      { total: 0, hold: 0, buy: 0, sell: 0 }
    )
  }

  const last24Hours = getWindowStats(24)
  const last48Hours = getWindowStats(48)
  const lastHour = getWindowStats(1)

  const symbolStats = decisions.reduce(
    (acc, decision) => {
      const entry = acc.get(decision.symbol) ?? { total: 0, hold: 0, buy: 0, sell: 0 }
      entry.total += 1
      if (decision.action === 'HOLD') entry.hold += 1
      if (decision.action === 'BUY') entry.buy += 1
      if (decision.action === 'SELL') entry.sell += 1
      acc.set(decision.symbol, entry)
      return acc
    },
    new Map<string, { total: number; hold: number; buy: number; sell: number }>()
  )
  const exploitationCount = totalDecisions - explorationCount

  function getActionBadge(decision: Decision) {
    if (decision.was_random) {
      return (
        <StatusBadge tone="info" className="bg-purple-100 text-purple-700">
          EXPLORE
        </StatusBadge>
      )
    }

    if (decision.was_executed) {
      if (decision.action === 'BUY') {
        return <StatusBadge tone="positive">✓ BUY</StatusBadge>
      }
      if (decision.action === 'SELL') {
        return <StatusBadge tone="negative">✓ SELL</StatusBadge>
      }
    }

    if (decision.action === 'HOLD') {
      return <StatusBadge tone="muted">HOLD</StatusBadge>
    }

    return (
      <StatusBadge tone={decision.action === 'BUY' ? 'positive' : decision.action === 'SELL' ? 'negative' : 'default'}>
        {decision.action}
      </StatusBadge>
    )
  }

  return (
    <div className="min-h-screen bg-brand-background p-6 md:p-10">
      <div className="mx-auto flex max-w-7xl flex-col gap-8">
        <SurfaceCard
          padding="lg"
          className="flex flex-col gap-4 bg-brand-gradient text-white md:flex-row md:items-center md:justify-between"
        >
          <div>
            <h1 className="text-3xl font-semibold text-brand-glow">AI Decision Log</h1>
            <p className="mt-2 text-sm text-white/80">Complete transparency into every decision the RL agent makes</p>
          </div>

          <button
            onClick={resetAndFetch}
            disabled={loading}
            className={`rounded-full px-5 py-2 text-sm font-semibold shadow ${loading ? 'cursor-not-allowed bg-white/30 text-white/80' : 'bg-white text-brand hover:bg-brand-muted hover:text-brand'}`}
          >
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>
        </SurfaceCard>

        <SurfaceCard className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setStatusFilter('all')}
            className={`rounded-full px-4 py-2 text-sm font-medium transition ${statusFilter === 'all' ? 'bg-brand text-white shadow' : 'bg-brand-muted text-brand hover:bg-brand-muted/70'}`}
          >
            All Decisions ({totalDecisions})
          </button>
          <button
            onClick={() => setStatusFilter('executed')}
            className={`rounded-full px-4 py-2 text-sm font-medium transition ${statusFilter === 'executed' ? 'bg-brand text-white shadow' : 'bg-brand-muted text-brand hover:bg-brand-muted/70'}`}
          >
            Executed ({executedCount})
          </button>
          <button
            onClick={() => setStatusFilter('skipped')}
            className={`rounded-full px-4 py-2 text-sm font-medium transition ${statusFilter === 'skipped' ? 'bg-brand text-white shadow' : 'bg-brand-muted text-brand hover:bg-brand-muted/70'}`}
          >
            Not Executed ({skippedCount})
          </button>
          <button
            onClick={() => setStatusFilter('exploration')}
            className={`rounded-full px-4 py-2 text-sm font-medium transition ${statusFilter === 'exploration' ? 'bg-brand text-white shadow' : 'bg-brand-muted text-brand hover:bg-brand-muted/70'}`}
          >
            Exploration ({explorationCount})
          </button>
        </SurfaceCard>

        {/* Decision Log Table */}
        <SurfaceCard className="overflow-hidden">
          {error ? (
            <div className="p-8 text-center text-red-500">{error}</div>
          ) : loading && decisions.length === 0 ? (
            <div className="p-8 text-center text-slate-500">Loading AI decisions...</div>
          ) : decisions.length === 0 ? (
            <div className="p-8 text-center text-slate-500">
              No AI decisions for this filter yet. The agent will log new decisions on its next run.
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="border-b border-brand-muted bg-brand-muted/40">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-500">Time</th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-500">Symbol</th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-500">Decision</th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-500">State</th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-500">Reasoning</th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-500">Q-Values</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-brand-muted text-sm text-slate-600">
                    {decisions.map(decision => (
                      <tr key={decision.decision_id} className="odd:bg-brand-muted/30 transition-colors hover:bg-brand-muted/50">
                        <td className="px-4 py-3">
                          {new Date(decision.timestamp).toLocaleString()}
                        </td>
                      <td className="px-4 py-3">
                        <Link
                          href={`/stocks/${decision.symbol}`}
                          className="font-semibold text-brand hover:text-brand-light"
                        >
                          {decision.symbol}
                        </Link>
                        <div className="text-xs text-slate-400">{decision.name}</div>
                        </td>
                        <td className="px-4 py-3">
                          {getActionBadge(decision)}
                        </td>
                        <td className="px-4 py-3 text-xs">
                          <div className="space-y-1">
                            <div>RSI: <span className="font-semibold">{decision.state?.rsi?.toFixed(1) ?? 'N/A'}</span></div>
                            <div>Price: <span className="font-semibold">${decision.state?.price?.toFixed(2) ?? 'N/A'}</span></div>
                            <div>Position: <span className="font-semibold">{decision.state?.position_qty ?? 0}</span></div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-600 max-w-md">
                          {decision.reasoning}
                        </td>
                        <td className="px-4 py-3 text-xs">
                          {decision.q_values ? (
                            <div className="space-y-1 font-mono">
                              {(Object.entries(decision.q_values) as Array<[string, number | string]>).map(([action, value]) => (
                                <div key={action} className={action === decision.action ? 'font-bold text-brand' : 'text-slate-500'}>
                                  {action}: {typeof value === 'number' ? value.toFixed(3) : value}
                                </div>
                              ))}
                            </div>
                          ) : (
                            <span className="text-slate-400">N/A</span>
                          )}
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

        <SurfaceCard>
          <h2 className="text-xl font-semibold text-slate-800">Decision Mix</h2>
          <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-4 lg:grid-cols-6">
            <div className="rounded-2xl border border-brand-muted/60 bg-brand-muted/30 p-4">
              <div className="text-xs uppercase tracking-wide text-slate-500">Total Decisions</div>
              <div className="mt-2 text-2xl font-semibold text-slate-800">{totalDecisions}</div>
            </div>
            <div className="rounded-2xl border border-brand-muted/60 bg-white p-4">
              <div className="text-xs uppercase tracking-wide text-slate-500">HOLD</div>
              <div className="mt-2 text-2xl font-semibold text-slate-700">{holdCount}</div>
              <div className="text-xs text-slate-400">
                {totalDecisions > 0 ? ((holdCount / totalDecisions) * 100).toFixed(1) : 0}%
              </div>
            </div>
            <div className="rounded-2xl border border-brand-muted/60 bg-white p-4">
              <div className="text-xs uppercase tracking-wide text-emerald-500">BUY</div>
              <div className="mt-2 text-2xl font-semibold text-emerald-600">{buyCount}</div>
              <div className="text-xs text-slate-400">
                {actionSummary.executedBuys} executed
              </div>
            </div>
            <div className="rounded-2xl border border-brand-muted/60 bg-white p-4">
              <div className="text-xs uppercase tracking-wide text-rose-500">SELL</div>
              <div className="mt-2 text-2xl font-semibold text-rose-500">{sellCount}</div>
              <div className="text-xs text-slate-400">
                {actionSummary.executedSells} executed
              </div>
            </div>
            <div className="rounded-2xl border border-brand-muted/60 bg-white p-4">
              <div className="text-xs uppercase tracking-wide text-purple-500">Exploration</div>
              <div className="mt-2 text-2xl font-semibold text-purple-600">{explorationCount}</div>
              <div className="text-xs text-slate-400">
                {totalDecisions > 0 ? ((explorationCount / totalDecisions) * 100).toFixed(1) : 0}%
              </div>
            </div>
            <div className="rounded-2xl border border-brand-muted/60 bg-white p-4">
              <div className="text-xs uppercase tracking-wide text-brand">Exploitation</div>
              <div className="mt-2 text-2xl font-semibold text-slate-800">{exploitationCount}</div>
              <div className="text-xs text-slate-400">
                {totalDecisions > 0
                  ? ((exploitationCount / totalDecisions) * 100).toFixed(1)
                  : 0}%
              </div>
            </div>
          </div>
        </SurfaceCard>

        <SurfaceCard>
          <h2 className="mb-4 text-xl font-semibold text-slate-800">Recent Activity Summary</h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="rounded-2xl border border-brand-muted/60 bg-white p-4">
              <div className="text-sm text-slate-500">Last 24 Hours</div>
              <div className="mt-2 space-y-1 text-sm text-slate-600">
                <div>Total: <span className="font-bold">{last24Hours.total}</span></div>
                <div>HOLD: <span className="font-bold text-slate-600">{last24Hours.hold}</span></div>
                <div>BUY: <span className="font-bold text-emerald-600">{last24Hours.buy}</span></div>
                <div>SELL: <span className="font-bold text-rose-500">{last24Hours.sell}</span></div>
              </div>
            </div>
            <div className="rounded-2xl border border-brand-muted/60 bg-white p-4">
              <div className="text-sm text-slate-500">Last 48 Hours</div>
              <div className="mt-2 space-y-1 text-sm text-slate-600">
                <div>Total: <span className="font-bold">{last48Hours.total}</span></div>
                <div>HOLD: <span className="font-bold text-slate-600">{last48Hours.hold}</span></div>
                <div>BUY: <span className="font-bold text-emerald-600">{last48Hours.buy}</span></div>
                <div>SELL: <span className="font-bold text-rose-500">{last48Hours.sell}</span></div>
              </div>
            </div>
            <div className="rounded-2xl border border-brand-muted/60 bg-white p-4">
              <div className="text-sm text-slate-500">Last Hour</div>
              <div className="mt-2 space-y-1 text-sm text-slate-600">
                <div>Total: <span className="font-bold">{lastHour.total}</span></div>
                <div>HOLD: <span className="font-bold text-slate-600">{lastHour.hold}</span></div>
                <div>BUY: <span className="font-bold text-emerald-600">{lastHour.buy}</span></div>
                <div>SELL: <span className="font-bold text-rose-500">{lastHour.sell}</span></div>
              </div>
            </div>
          </div>
        </SurfaceCard>

        <SurfaceCard>
          <h2 className="text-xl font-semibold text-slate-800">Action Breakdown by Symbol (Last 500)</h2>
          <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
            {Array.from(symbolStats.entries())
              .sort((a, b) => b[1].total - a[1].total)
              .map(([symbol, stats]) => (
                <div key={symbol} className="rounded-2xl border border-brand-muted/60 bg-white p-3">
                  <div className="mb-2 font-semibold text-slate-800">{symbol}</div>
                  <div className="text-xs space-y-1">
                    <div className="flex justify-between text-slate-500">
                      <span>HOLD</span>
                      <span className="font-semibold text-slate-700">
                        {stats.hold} ({((stats.hold / stats.total) * 100).toFixed(0)}%)
                      </span>
                    </div>
                    <div className="flex justify-between text-emerald-600">
                      <span>BUY</span>
                      <span className="font-semibold">{stats.buy}</span>
                    </div>
                    <div className="flex justify-between text-rose-500">
                      <span>SELL</span>
                      <span className="font-semibold">{stats.sell}</span>
                    </div>
                  </div>
                </div>
              ))}
          </div>
        </SurfaceCard>
      </div>
    </div>
  )
}
