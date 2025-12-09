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
  const [counts, setCounts] = useState({ total: 0, executed: 0, skipped: 0, exploration: 0 })

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

      // Calculate counts from fetched decisions
      const newCounts = newDecisions.reduce(
        (acc, d) => {
          acc.total += 1
          if (d.was_executed) acc.executed += 1
          else acc.skipped += 1
          if (d.was_random) acc.exploration += 1
          return acc
        },
        { total: 0, executed: 0, skipped: 0, exploration: 0 }
      )
      setCounts(newCounts)
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

      // Update counts
      setCounts(prev => {
        const added = newDecisions.reduce(
          (acc, d) => {
            acc.total += 1
            if (d.was_executed) acc.executed += 1
            else acc.skipped += 1
            if (d.was_random) acc.exploration += 1
            return acc
          },
          { total: 0, executed: 0, skipped: 0, exploration: 0 }
        )
        return {
          total: prev.total + added.total,
          executed: prev.executed + added.executed,
          skipped: prev.skipped + added.skipped,
          exploration: prev.exploration + added.exploration
        }
      })
    } catch (err) {
      console.error('Failed to fetch additional AI logs:', err)
      setError('Failed to load more decisions.')
    } finally {
      setLoadingMore(false)
    }
  }

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
    <div className="space-y-6">
      {/* Header */}
      <SurfaceCard
        padding="lg"
        className="flex flex-col gap-4 bg-brand-gradient text-white md:flex-row md:items-center md:justify-between"
      >
        <div>
          <h1 className="text-2xl font-semibold text-brand-glow">AI Decision Log</h1>
          <p className="mt-1 text-sm text-white/70">
            Complete transparency into every decision the Q-Learning agent makes
          </p>
        </div>

        <button
          onClick={resetAndFetch}
          disabled={loading}
          className={`rounded-full px-5 py-2 text-sm font-semibold shadow ${loading ? 'cursor-not-allowed bg-white/30 text-white/80' : 'bg-white text-brand hover:bg-brand-muted hover:text-brand'}`}
        >
          {loading ? 'Refreshing...' : 'Refresh'}
        </button>
      </SurfaceCard>

      {/* Filter Buttons */}
      <SurfaceCard className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => setStatusFilter('all')}
          className={`rounded-full px-4 py-2 text-sm font-medium transition ${statusFilter === 'all' ? 'bg-brand text-white shadow' : 'bg-brand-muted text-brand hover:bg-brand-muted/70'}`}
        >
          All Decisions ({counts.total})
        </button>
        <button
          onClick={() => setStatusFilter('executed')}
          className={`rounded-full px-4 py-2 text-sm font-medium transition ${statusFilter === 'executed' ? 'bg-brand text-white shadow' : 'bg-brand-muted text-brand hover:bg-brand-muted/70'}`}
        >
          Executed ({counts.executed})
        </button>
        <button
          onClick={() => setStatusFilter('skipped')}
          className={`rounded-full px-4 py-2 text-sm font-medium transition ${statusFilter === 'skipped' ? 'bg-brand text-white shadow' : 'bg-brand-muted text-brand hover:bg-brand-muted/70'}`}
        >
          Not Executed ({counts.skipped})
        </button>
        <button
          onClick={() => setStatusFilter('exploration')}
          className={`rounded-full px-4 py-2 text-sm font-medium transition ${statusFilter === 'exploration' ? 'bg-brand text-white shadow' : 'bg-brand-muted text-brand hover:bg-brand-muted/70'}`}
        >
          Exploration ({counts.exploration})
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
    </div>
  )
}
