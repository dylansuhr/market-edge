/**
 * Overview Page
 *
 * Displays key trading metrics: bankroll, positions, recent trades
 */

import { query } from '@/lib/db'

export const dynamic = 'force-dynamic' // Disable caching for real-time data

async function getOverviewData() {
  // Get bankroll stats
  const bankroll = await query(`
    SELECT
      balance,
      total_trades,
      winning_trades,
      total_pnl,
      roi,
      CASE WHEN total_trades > 0 THEN CAST(winning_trades AS NUMERIC) / total_trades ELSE 0 END as win_rate
    FROM paper_bankroll
    ORDER BY updated_at DESC
    LIMIT 1
  `)

  // Get active positions (from VIEW)
  const positions = await query(`
    SELECT
      ap.symbol,
      ap.quantity,
      ap.avg_entry_price as avg_price,
      (ap.quantity * ap.avg_entry_price) as current_value
    FROM active_positions ap
    WHERE ap.quantity > 0
    ORDER BY current_value DESC
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
    bankroll: bankroll[0] || null,
    positions: positions || [],
    recentTrades: recentTrades || []
  }
}

export default async function OverviewPage() {
  const data = await getOverviewData()

  return (
    <div>
      <h1 className="text-3xl font-bold mb-8">Trading Overview</h1>

      {/* Bankroll Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-white shadow rounded-lg p-6">
          <h3 className="text-gray-500 text-sm">Balance</h3>
          <p className="text-2xl font-bold">
            ${data.bankroll?.balance ? parseFloat(data.bankroll.balance).toFixed(2) : '10,000.00'}
          </p>
        </div>
        <div className="bg-white shadow rounded-lg p-6">
          <h3 className="text-gray-500 text-sm">ROI</h3>
          <p className={`text-2xl font-bold ${parseFloat(data.bankroll?.roi || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {(parseFloat(data.bankroll?.roi || 0) * 100).toFixed(2)}%
          </p>
        </div>
        <div className="bg-white shadow rounded-lg p-6">
          <h3 className="text-gray-500 text-sm">Win Rate</h3>
          <p className="text-2xl font-bold">
            {(parseFloat(data.bankroll?.win_rate || 0) * 100).toFixed(1)}%
          </p>
        </div>
        <div className="bg-white shadow rounded-lg p-6">
          <h3 className="text-gray-500 text-sm">Total Trades</h3>
          <p className="text-2xl font-bold">
            {data.bankroll?.total_trades || 0}
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
                <th className="pb-2">Current Value</th>
              </tr>
            </thead>
            <tbody>
              {data.positions.map((pos: any) => (
                <tr key={pos.symbol} className="border-b">
                  <td className="py-2 font-semibold">{pos.symbol}</td>
                  <td className="py-2">{pos.quantity}</td>
                  <td className="py-2">${parseFloat(pos.avg_price).toFixed(2)}</td>
                  <td className="py-2">${parseFloat(pos.current_value).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-gray-500">No active positions</p>
        )}
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
                  <td className="py-2 font-semibold">{trade.symbol}</td>
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
