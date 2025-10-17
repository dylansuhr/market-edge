/**
 * Trades Page
 *
 * Complete trade history with details
 */

import { query } from '@/lib/db'

export const dynamic = 'force-dynamic'

async function getTradesData() {
  const trades = await query(`
    SELECT
      pt.trade_id as id,
      s.symbol,
      s.name,
      pt.action,
      pt.quantity,
      pt.price,
      (pt.quantity * pt.price) as total_value,
      pt.profit_loss as pnl,
      pt.strategy,
      pt.reasoning,
      pt.executed_at
    FROM paper_trades pt
    JOIN stocks s ON s.stock_id = pt.stock_id
    ORDER BY pt.executed_at DESC
    LIMIT 100
  `)

  return { trades }
}

export default async function TradesPage() {
  const data = await getTradesData()

  return (
    <div>
      <h1 className="text-3xl font-bold mb-8">Trade History</h1>

      <div className="bg-white shadow rounded-lg p-6">
        {data.trades.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left border-b">
                  <th className="pb-2">Time</th>
                  <th className="pb-2">Symbol</th>
                  <th className="pb-2">Action</th>
                  <th className="pb-2">Qty</th>
                  <th className="pb-2">Price</th>
                  <th className="pb-2">Total</th>
                  <th className="pb-2">P&L</th>
                  <th className="pb-2">Strategy</th>
                  <th className="pb-2">Reasoning</th>
                </tr>
              </thead>
              <tbody>
                {data.trades.map((trade: any) => (
                  <tr key={trade.id} className="border-b hover:bg-gray-50">
                    <td className="py-3 text-sm">
                      {new Date(trade.executed_at).toLocaleString()}
                    </td>
                    <td className="py-3 font-semibold">{trade.symbol}</td>
                    <td className={`py-3 font-semibold ${trade.action === 'BUY' ? 'text-green-600' : 'text-red-600'}`}>
                      {trade.action}
                    </td>
                    <td className="py-3">{trade.quantity}</td>
                    <td className="py-3">${parseFloat(trade.price).toFixed(2)}</td>
                    <td className="py-3">${parseFloat(trade.total_value).toFixed(2)}</td>
                    <td className={`py-3 font-semibold ${parseFloat(trade.pnl || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {trade.pnl ? `$${parseFloat(trade.pnl).toFixed(2)}` : '-'}
                    </td>
                    <td className="py-3 text-sm">{trade.strategy}</td>
                    <td className="py-3 text-sm text-gray-600 max-w-md truncate">
                      {trade.reasoning || '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-gray-500">No trades yet</p>
        )}
      </div>
    </div>
  )
}
