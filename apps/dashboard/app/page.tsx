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
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')

    const res = await fetch(`${baseUrl}/api/automation?workflow=all&limit=3`, {
      cache: 'no-store'
    })

    if (!res.ok) {
      throw new Error(`Automation API returned ${res.status}`)
    }

    const data = await res.json()
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
      <h1 className="text-3xl font-bold mb-8">Trading Overview</h1>

      {/* Portfolio Snapshot */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-white shadow rounded-lg p-6">
          <h3 className="text-gray-500 text-sm">Net Worth</h3>
          <p className="text-2xl font-bold">
            ${parseFloat(metrics.net_worth).toFixed(2)}
          </p>
        </div>
        <div className="bg-white shadow rounded-lg p-6">
          <h3 className="text-gray-500 text-sm">Cash Balance</h3>
          <p className="text-2xl font-bold">
            ${parseFloat(metrics.cash_balance).toFixed(2)}
          </p>
        </div>
        <div className="bg-white shadow rounded-lg p-6">
          <h3 className="text-gray-500 text-sm">Open Positions Value</h3>
          <p className="text-2xl font-bold">
            ${parseFloat(metrics.open_positions_market_value).toFixed(2)}
          </p>
        </div>
        <div className="bg-white shadow rounded-lg p-6">
          <h3 className="text-gray-500 text-sm">Unrealized P&amp;L</h3>
          <p className={`text-2xl font-bold ${parseFloat(metrics.total_unrealized_pnl) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            ${parseFloat(metrics.total_unrealized_pnl).toFixed(2)}
          </p>
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
      <div className="bg-white shadow rounded-lg p-6 mb-8">
        <h2 className="text-xl font-bold mb-4">Active Positions</h2>
        {data.positions.length > 0 ? (
          <table className="w-full">
            <thead>
              <tr className="text-left border-b">
                <th className="pb-2">Symbol</th>
                <th className="pb-2">Quantity</th>
                <th className="pb-2">Avg Price</th>
                <th className="pb-2">Current Price</th>
                <th className="pb-2">Market Value</th>
                <th className="pb-2">Unrealized P&amp;L</th>
              </tr>
            </thead>
            <tbody>
              {data.positions.map((pos: any) => (
                <tr key={pos.symbol} className="border-b">
                  <td className="py-2 font-semibold">
                    <Link href={`/stocks/${pos.symbol}`} className="text-blue-600 hover:underline">
                      {pos.symbol}
                    </Link>
                  </td>
                  <td className="py-2">{pos.quantity}</td>
                  <td className="py-2">${parseFloat(pos.avg_price).toFixed(2)}</td>
                  <td className="py-2">${parseFloat(pos.current_price).toFixed(2)}</td>
                  <td className="py-2">${parseFloat(pos.market_value).toFixed(2)}</td>
                  <td className={`py-2 ${parseFloat(pos.unrealized_pnl) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    ${parseFloat(pos.unrealized_pnl).toFixed(2)} ({parseFloat(pos.unrealized_pnl_pct).toFixed(2)}%)
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-gray-500">No active positions</p>
        )}
      </div>

      {/* Pipeline Status */}
      <div className="bg-white shadow rounded-lg p-6">
        <h2 className="text-xl font-bold mb-4">Today&apos;s Pipeline</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {automation.map(run => (
            <div key={run.workflow_file} className="border rounded-lg p-4">
              <div className="text-sm text-gray-500 uppercase mb-1">{run.label}</div>
              <div className="text-sm text-gray-700">
                {run.latest ? new Date(run.latest).toLocaleString() : 'No runs yet'}
              </div>
              <div className="text-xs text-gray-500 mt-1">
                Status: <span className="font-semibold">{run.statusLabel}</span>
              </div>
              {run.url && (
                <a
                  href={run.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-blue-600 hover:underline mt-2 inline-block"
                >
                  View on GitHub
                </a>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Recent Trades */}
      <div className="bg-white shadow rounded-lg p-6">
        <h2 className="text-xl font-bold mb-4">Recent Trades</h2>
        {data.recentTrades.length > 0 ? (
          <table className="w-full">
            <thead>
              <tr className="text-left border-b">
                <th className="pb-2">Time</th>
                <th className="pb-2">Symbol</th>
                <th className="pb-2">Action</th>
                <th className="pb-2">Quantity</th>
                <th className="pb-2">Price</th>
                <th className="pb-2">P&L</th>
              </tr>
            </thead>
            <tbody>
              {data.recentTrades.map((trade: any, idx: number) => (
                <tr key={idx} className="border-b">
                  <td className="py-2 text-sm">{new Date(trade.executed_at).toLocaleString()}</td>
                  <td className="py-2 font-semibold">
                    <Link href={`/stocks/${trade.symbol}`} className="text-blue-600 hover:underline">
                      {trade.symbol}
                    </Link>
                  </td>
                  <td className={`py-2 ${trade.action === 'BUY' ? 'text-green-600' : 'text-red-600'}`}>
                    {trade.action}
                  </td>
                  <td className="py-2">{trade.quantity}</td>
                  <td className="py-2">${parseFloat(trade.price).toFixed(2)}</td>
                  <td className={`py-2 ${parseFloat(trade.pnl || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {trade.pnl ? `$${parseFloat(trade.pnl).toFixed(2)}` : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-gray-500">No trades yet</p>
        )}
      </div>
    </div>
  )
}
