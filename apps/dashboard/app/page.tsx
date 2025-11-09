/**
 * Overview Page
 *
 * Displays key trading metrics: bankroll, positions, recent trades
 */

import Link from 'next/link'
import { query } from '@/lib/db'
import { formatCurrency, formatPercent } from '@/lib/format'
import { SurfaceCard } from '@/components/ui/SurfaceCard'
import { MetricStat } from '@/components/ui/MetricStat'
import { StatusBadge } from '@/components/ui/StatusBadge'
import CapitalPipelineStatus from '@/components/CapitalPipelineStatus'

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
    starting_cash: 100000,
    cash_balance: 100000,
    open_positions_market_value: 0,
    open_positions_cost_basis: 0,
    total_unrealized_pnl: 0,
    realized_pnl: 0,
    total_pnl: 0,
    net_worth: 100000,
    realized_roi: 0,
    total_roi: 0,
    total_trades: 0,
    winning_trades: 0,
    win_rate: 0
  }

  return (
    <div>
      <div className="mb-8 grid grid-cols-1 gap-6 md:grid-cols-[2fr,1fr]">
        <div className="rounded-3xl bg-brand-gradient p-10 text-white shadow-card">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-white/70">Portfolio value</p>
              <h2 className="mt-3 text-5xl font-semibold text-brand-glow">{formatCurrency(metrics.net_worth)}</h2>
              <p className="mt-4 text-sm text-white/80">Starting cash {formatCurrency(metrics.starting_cash)} · Total P&amp;L {formatCurrency(metrics.total_pnl)}</p>
            </div>
            <div className="rounded-2xl bg-white/15 px-6 py-5 text-right shadow-card">
              <p className="text-xs uppercase tracking-wide text-white/70">Realized P&amp;L</p>
              <p className={`mt-1 text-3xl font-semibold ${parseFloat(metrics.realized_pnl) >= 0 ? 'text-emerald-100' : 'text-rose-100'} text-brand-glow`}>
                {formatCurrency(metrics.realized_pnl)}
              </p>
              <p className="text-xs text-white/75">Total ROI {formatPercent(metrics.total_roi, 2)}</p>
            </div>
          </div>
          <div className="mt-6 flex flex-wrap gap-3">
            <span className="brand-pill bg-white/15 text-white">Cash {formatCurrency(metrics.cash_balance)}</span>
            <span className="brand-pill bg-white/15 text-white">Unrealized {formatCurrency(metrics.total_unrealized_pnl)}</span>
            <span className="brand-pill bg-white/15 text-white">Trades {metrics.total_trades.toLocaleString()}</span>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-4">
          <SurfaceCard className="border border-brand-muted">
            <MetricStat label="Cash Balance" value={formatCurrency(metrics.cash_balance)} />
          </SurfaceCard>
          <SurfaceCard className="border border-brand-muted">
            <MetricStat
              label="Unrealized P&L"
              value={formatCurrency(metrics.total_unrealized_pnl)}
              tone={parseFloat(metrics.total_unrealized_pnl) >= 0 ? 'positive' : 'negative'}
            />
          </SurfaceCard>
        </div>
      </div>

      <div className="mb-10 grid grid-cols-1 gap-4 md:grid-cols-3">
        <SurfaceCard>
          <MetricStat label="Open Positions Value" value={formatCurrency(metrics.open_positions_market_value)} />
        </SurfaceCard>
        <SurfaceCard>
          <MetricStat
            label="Win Rate"
            value={formatPercent(metrics.win_rate || 0)}
            description={`${metrics.total_trades.toLocaleString()} trades`}
          />
        </SurfaceCard>
        <SurfaceCard>
          <MetricStat label="Total Trades" value={metrics.total_trades.toLocaleString()} />
        </SurfaceCard>
      </div>

      {/* Performance Snapshot */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-white shadow rounded-lg p-6">
          <h3 className="text-gray-500 text-sm">Realized P&amp;L</h3>
          <p className={`text-2xl font-bold ${parseFloat(metrics.realized_pnl) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {formatCurrency(metrics.realized_pnl)}
          </p>
        </div>
        <div className="bg-white shadow rounded-lg p-6">
          <h3 className="text-gray-500 text-sm">Total P&amp;L</h3>
          <p className={`text-2xl font-bold ${parseFloat(metrics.total_pnl) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {formatCurrency(metrics.total_pnl)}
          </p>
        </div>
        <div className="bg-white shadow rounded-lg p-6">
          <h3 className="text-gray-500 text-sm">Total ROI</h3>
          <p className={`text-2xl font-bold ${parseFloat(metrics.total_roi) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {formatPercent(metrics.total_roi, 2)}
          </p>
        </div>
        <div className="bg-white shadow rounded-lg p-6">
          <h3 className="text-gray-500 text-sm">Win Rate</h3>
          <p className="text-2xl font-bold">
            {formatPercent(metrics.win_rate || 0)}
            <span className="text-sm text-gray-400 ml-2">
              ({metrics.total_trades.toLocaleString()} trades)
            </span>
          </p>
        </div>
      </div>

      {/* Active Positions */}
      <SurfaceCard className="mb-8">
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
                  <td className="py-3">{formatCurrency(pos.avg_price)}</td>
                  <td className="py-3">{formatCurrency(pos.current_price)}</td>
                  <td className="py-3">{formatCurrency(pos.market_value)}</td>
                  <td className={`py-3 font-semibold ${parseFloat(pos.unrealized_pnl) >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                    {formatCurrency(pos.unrealized_pnl)} ({formatPercent(pos.unrealized_pnl_pct, 2)})
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-slate-500">No active positions</p>
        )}
      </SurfaceCard>

      {/* Pipeline Status */}
      <CapitalPipelineStatus />

      {/* Recent Trades */}
      <SurfaceCard>
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
                  <td className="py-3">{formatCurrency(trade.price)}</td>
                  <td className={`py-3 font-semibold ${parseFloat(trade.pnl || 0) >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                    {trade.pnl ? formatCurrency(trade.pnl) : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-slate-500">No trades yet</p>
        )}
      </SurfaceCard>
    </div>
  )
}
