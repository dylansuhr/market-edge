/**
 * Overview Page
 *
 * Displays key trading metrics: bankroll, positions, recent trades
 */

import Link from 'next/link'
import { query } from '@/lib/db'

const WORKFLOW_LABELS: Record<string, string> = {
  'market-data-etl.yml': 'Market Data ETL',
  'trading-agent.yml': 'Trading Agent',
  'trade-settlement.yml': 'Trade Settlement'
}

type PipelineRun = {
  workflow_file: string
  label: string
  latest: string | null
  statusLabel: string
  url: string | null
}

async function fetchPipelineStatus(): Promise<PipelineRun[]> {
  try {
    const baseUrl =
      process.env.NEXT_PUBLIC_SITE_URL ??
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3001')

    const res = await fetch(`${baseUrl}/api/automation?workflow=all&limit=3`, {
      cache: 'no-store'
    })

    const data = await res.json()
    if (!res.ok) {
      throw new Error(data?.error || `Automation API returned ${res.status}`)
    }
    const runs = Array.isArray(data.runs) ? data.runs : []

    const grouped: Record<string, { latest: string | null; status: string; conclusion: string | null; url: string | null }> = {}

    runs.forEach((run: any) => {
      const file = run.workflow_file
      if (!grouped[file]) {
        grouped[file] = {
          latest: run.updated_at || run.created_at || null,
          status: run.status || 'unknown',
          conclusion: run.conclusion || null,
          url: run.html_url || null
        }
      }
    })

    return Object.keys(WORKFLOW_LABELS).map(file => {
      const info = grouped[file]
      let statusLabel = 'No runs yet'
      if (info) {
        if (info.status === 'in_progress') {
          statusLabel = 'In Progress'
        } else if (info.conclusion) {
          statusLabel = info.conclusion.toUpperCase()
        } else {
          statusLabel = info.status || 'UNKNOWN'
        }
      }

      return {
        workflow_file: file,
        label: WORKFLOW_LABELS[file] || file,
        latest: info?.latest || null,
        statusLabel,
        url: info?.url || null
      }
    })
  } catch (error) {
    console.error('Failed to load pipeline status:', error)
    return Object.keys(WORKFLOW_LABELS).map(file => ({
      workflow_file: file,
      label: WORKFLOW_LABELS[file] || file,
      latest: null,
      statusLabel: 'Unavailable',
      url: null
    }))
  }
}

export const dynamic = 'force-dynamic' // Disable caching for real-time data

async function getOverviewData() {
  // Net worth + cash + ROI snapshot
  const netWorth = await query(`
    SELECT
      starting_cash,
      cash_balance,
      open_positions_market_value,
      open_positions_cost_basis,
      total_unrealized_pnl,
      realized_pnl,
      total_pnl,
      net_worth,
      realized_roi,
      total_roi,
      total_trades,
      winning_trades,
      win_rate,
      updated_at
    FROM net_worth_summary
    LIMIT 1
  `)

  // Mark-to-market active positions
  const positions = await query(`
    SELECT
      ap.symbol,
      ap.quantity,
      ap.avg_entry_price AS avg_price,
      ap.current_price,
      ap.cost_basis,
      ap.market_value,
      ap.unrealized_pnl,
      ap.unrealized_pnl_pct
    FROM active_positions_with_market_value ap
    WHERE ap.quantity > 0
    ORDER BY ap.market_value DESC
  `)

  // Get recent trades (last 10)
  const recentTrades = await query(`
    SELECT
      s.symbol,
      pt.action,
      pt.quantity,
      pt.price,
      (pt.quantity * pt.price) as total_value,
      pt.profit_loss as pnl,
      pt.executed_at
    FROM paper_trades pt
    JOIN stocks s ON s.stock_id = pt.stock_id
    ORDER BY pt.executed_at DESC
    LIMIT 10
  `)

  return {
    netWorth: netWorth[0] || null,
    positions: positions || [],
    recentTrades: recentTrades || []
  }
}

export default async function OverviewPage() {
  const data = await getOverviewData()
  const metrics = data.netWorth || {
    starting_cash: 10000,
    cash_balance: 10000,
    open_positions_market_value: 0,
    open_positions_cost_basis: 0,
    total_unrealized_pnl: 0,
    realized_pnl: 0,
    total_pnl: 0,
    net_worth: 10000,
    realized_roi: 0,
    total_roi: 0,
    total_trades: 0,
    winning_trades: 0,
    win_rate: 0
  }
  const automation = await fetchPipelineStatus()

  return (
    <div>
      <div className="mb-8 grid grid-cols-1 gap-6 md:grid-cols-[2fr,1fr]">
        <div className="rounded-3xl bg-brand-gradient p-10 text-white shadow-card">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-white/70">Portfolio value</p>
              <h2 className="mt-3 text-5xl font-semibold text-brand-glow">${parseFloat(metrics.net_worth).toFixed(2)}</h2>
              <p className="mt-4 text-sm text-white/80">Starting cash ${parseFloat(metrics.starting_cash).toFixed(2)} · Total P&amp;L ${parseFloat(metrics.total_pnl).toFixed(2)}</p>
            </div>
            <div className="rounded-2xl bg-white/15 px-6 py-5 text-right shadow-card">
              <p className="text-xs uppercase tracking-wide text-white/70">Realized P&amp;L</p>
              <p className={`mt-1 text-3xl font-semibold ${parseFloat(metrics.realized_pnl) >= 0 ? 'text-emerald-100' : 'text-rose-100'} text-brand-glow`}>
                ${parseFloat(metrics.realized_pnl).toFixed(2)}
              </p>
              <p className="text-xs text-white/75">Total ROI {(parseFloat(metrics.total_roi) * 100).toFixed(2)}%</p>
            </div>
          </div>
          <div className="mt-6 flex flex-wrap gap-3">
            <span className="brand-pill bg-white/15 text-white">Cash ${parseFloat(metrics.cash_balance).toFixed(2)}</span>
            <span className="brand-pill bg-white/15 text-white">Unrealized ${parseFloat(metrics.total_unrealized_pnl).toFixed(2)}</span>
            <span className="brand-pill bg-white/15 text-white">Trades {metrics.total_trades}</span>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-4">
          <div className="rounded-3xl border border-brand-muted bg-brand-surface p-6 shadow-card">
            <p className="text-sm text-slate-500">Cash Balance</p>
            <p className="mt-2 text-2xl font-semibold text-slate-800">${parseFloat(metrics.cash_balance).toFixed(2)}</p>
          </div>
          <div className="rounded-3xl border border-brand-muted bg-brand-surface p-6 shadow-card">
            <p className="text-sm text-slate-500">Unrealized P&amp;L</p>
            <p className={`mt-2 text-2xl font-semibold ${parseFloat(metrics.total_unrealized_pnl) >= 0 ? 'text-green-600' : 'text-red-500'}`}>
              ${parseFloat(metrics.total_unrealized_pnl).toFixed(2)}
            </p>
          </div>
        </div>
      </div>

      <div className="mb-10 grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-3xl bg-brand-surface p-6 shadow-card">
          <p className="text-sm text-slate-500">Open Positions Value</p>
          <p className="mt-2 text-2xl font-semibold text-slate-800">${parseFloat(metrics.open_positions_market_value).toFixed(2)}</p>
        </div>
        <div className="rounded-3xl bg-brand-surface p-6 shadow-card">
          <p className="text-sm text-slate-500">Win Rate</p>
          <p className="mt-2 text-2xl font-semibold text-slate-800">{(parseFloat(metrics.win_rate || 0) * 100).toFixed(1)}%</p>
        </div>
        <div className="rounded-3xl bg-brand-surface p-6 shadow-card">
          <p className="text-sm text-slate-500">Total Trades</p>
          <p className="mt-2 text-2xl font-semibold text-slate-800">{metrics.total_trades}</p>
        </div>
      </div>

      {/* Performance Snapshot */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-white shadow rounded-lg p-6">
          <h3 className="text-gray-500 text-sm">Realized P&amp;L</h3>
          <p className={`text-2xl font-bold ${parseFloat(metrics.realized_pnl) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            ${parseFloat(metrics.realized_pnl).toFixed(2)}
          </p>
        </div>
        <div className="bg-white shadow rounded-lg p-6">
          <h3 className="text-gray-500 text-sm">Total P&amp;L</h3>
          <p className={`text-2xl font-bold ${parseFloat(metrics.total_pnl) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            ${parseFloat(metrics.total_pnl).toFixed(2)}
          </p>
        </div>
        <div className="bg-white shadow rounded-lg p-6">
          <h3 className="text-gray-500 text-sm">Total ROI</h3>
          <p className={`text-2xl font-bold ${parseFloat(metrics.total_roi) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {(parseFloat(metrics.total_roi) * 100).toFixed(2)}%
          </p>
        </div>
        <div className="bg-white shadow rounded-lg p-6">
          <h3 className="text-gray-500 text-sm">Win Rate</h3>
          <p className="text-2xl font-bold">
            {(parseFloat(metrics.win_rate || 0) * 100).toFixed(1)}%
            <span className="text-sm text-gray-400 ml-2">
              ({metrics.total_trades} trades)
            </span>
          </p>
        </div>
      </div>

      {/* Active Positions */}
      <div className="mb-8 rounded-3xl bg-brand-surface p-6 shadow-card">
        <h2 className="text-xl font-semibold text-slate-800 mb-4">Active Positions</h2>
        {data.positions.length > 0 ? (
          <table className="w-full">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-slate-400">
                <th className="pb-3">Symbol</th>
                <th className="pb-3">Quantity</th>
                <th className="pb-3">Avg Price</th>
                <th className="pb-3">Current Price</th>
                <th className="pb-3">Market Value</th>
                <th className="pb-3">Unrealized P&amp;L</th>
              </tr>
            </thead>
            <tbody className="text-sm text-slate-600">
              {data.positions.map((pos: any) => (
                <tr key={pos.symbol} className="border-t border-slate-100 odd:bg-brand-muted/40 transition-colors hover:bg-brand-muted/60">
                  <td className="py-3 font-semibold text-slate-800">
                    <Link href={`/stocks/${pos.symbol}`} className="text-brand hover:text-brand-light">
                      {pos.symbol}
                    </Link>
                  </td>
                  <td className="py-3">{pos.quantity}</td>
                  <td className="py-3">${parseFloat(pos.avg_price).toFixed(2)}</td>
                  <td className="py-3">${parseFloat(pos.current_price).toFixed(2)}</td>
                  <td className="py-3">${parseFloat(pos.market_value).toFixed(2)}</td>
                  <td className={`py-3 font-semibold ${parseFloat(pos.unrealized_pnl) >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                    ${parseFloat(pos.unrealized_pnl).toFixed(2)} ({parseFloat(pos.unrealized_pnl_pct).toFixed(2)}%)
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-slate-500">No active positions</p>
        )}
      </div>

      {/* Pipeline Status */}
        <div className="mb-8 rounded-3xl bg-brand-surface p-6 shadow-card">
        <h2 className="mb-4 text-xl font-semibold text-slate-800">Today&apos;s Pipeline</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {automation.map(run => {
            const statusLower = run.statusLabel.toLowerCase()
            const statusTone = statusLower.includes('progress')
              ? 'text-amber-500'
              : statusLower.includes('fail')
              ? 'text-rose-500'
              : statusLower.includes('success')
              ? 'text-emerald-500'
              : statusLower.includes('unavailable') || statusLower.includes('no runs')
              ? 'text-slate-400'
              : 'text-brand'

            return (
            <div key={run.workflow_file} className="rounded-2xl border border-brand-muted/60 bg-white p-4 text-sm text-slate-600">
              <div className="text-xs uppercase tracking-wide text-slate-400">{run.label}</div>
              <div className="mt-2 text-base font-semibold text-slate-800">
                {run.latest ? new Date(run.latest).toLocaleString() : 'No runs yet'}
              </div>
              <div className={`mt-2 text-xs ${statusTone}`}>
                Status: <span className="font-semibold">{run.statusLabel}</span>
              </div>
              {run.url && (
                <a
                  href={run.url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 inline-block text-xs font-medium text-brand hover:text-brand-light"
                >
                  View on GitHub
                </a>
              )}
            </div>
            )
          })}
        </div>
      </div>

      {/* Recent Trades */}
      <div className="rounded-3xl bg-brand-surface p-6 shadow-card">
        <h2 className="mb-4 text-xl font-semibold text-slate-800">Recent Trades</h2>
        {data.recentTrades.length > 0 ? (
          <table className="w-full">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-slate-400">
                <th className="pb-3">Time</th>
                <th className="pb-3">Symbol</th>
                <th className="pb-3">Action</th>
                <th className="pb-3">Quantity</th>
                <th className="pb-3">Price</th>
                <th className="pb-3">P&L</th>
              </tr>
            </thead>
            <tbody className="text-sm text-slate-600">
              {data.recentTrades.map((trade: any, idx: number) => (
                <tr key={idx} className="border-t border-slate-100 odd:bg-brand-muted/30 transition-colors hover:bg-brand-muted/60">
                  <td className="py-3 text-sm">{new Date(trade.executed_at).toLocaleString()}</td>
                  <td className="py-3 font-semibold">
                    <Link href={`/stocks/${trade.symbol}`} className="text-brand hover:text-brand-light">
                      {trade.symbol}
                    </Link>
                  </td>
                  <td className={`py-3 font-semibold ${trade.action === 'BUY' ? 'text-green-600' : 'text-red-500'}`}>
                    {trade.action}
                  </td>
                  <td className="py-3">{trade.quantity}</td>
                  <td className="py-3">${parseFloat(trade.price).toFixed(2)}</td>
                  <td className={`py-3 font-semibold ${parseFloat(trade.pnl || 0) >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                    {trade.pnl ? `$${parseFloat(trade.pnl).toFixed(2)}` : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-slate-500">No trades yet</p>
        )}
      </div>
    </div>
  )
}
