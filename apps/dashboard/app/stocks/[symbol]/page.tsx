import Link from 'next/link'
import { notFound } from 'next/navigation'
import { query } from '@/lib/db'

interface StockParams {
  params: {
    symbol: string
  }
}

async function getStockData(symbolParam: string) {
  const symbol = symbolParam.toUpperCase()

  const stocks = await query(
    `
    SELECT stock_id, symbol, name
    FROM stocks
    WHERE UPPER(symbol) = $1
    LIMIT 1
  `,
    [symbol]
  )

  if (stocks.length === 0) {
    return null
  }

  const stock = stocks[0]

  const positionRows = await query(
    `
    SELECT
      symbol,
      quantity,
      avg_entry_price,
      current_price,
      cost_basis,
      market_value,
      unrealized_pnl,
      unrealized_pnl_pct,
      price_timestamp
    FROM active_positions_with_market_value
    WHERE stock_id = $1
    LIMIT 1
  `,
    [stock.stock_id]
  )

  const position = positionRows[0] || null

  const latestPriceRows = await query(
    `
    SELECT close, timestamp
    FROM price_snapshots
    WHERE stock_id = $1
    ORDER BY timestamp DESC
    LIMIT 1
  `,
    [stock.stock_id]
  )

  const trades = await query(
    `
    SELECT
      pt.trade_id,
      pt.action,
      pt.quantity,
      pt.price,
      pt.profit_loss,
      pt.executed_at,
      pt.exit_price,
      pt.strategy,
      pt.reasoning,
      pt.status
    FROM paper_trades pt
    WHERE pt.stock_id = $1
    ORDER BY pt.trade_id DESC
    LIMIT 100
  `,
    [stock.stock_id]
  )

  const decisions = await query(
    `
    SELECT
      tdl.decision_id,
      tdl.timestamp,
      tdl.action,
      tdl.was_executed,
      tdl.was_random,
      tdl.reasoning,
      tdl.q_values,
      tdl.state
    FROM trade_decisions_log tdl
    WHERE tdl.stock_id = $1
    ORDER BY tdl.decision_id DESC
    LIMIT 100
  `,
    [stock.stock_id]
  )

  return {
    stock,
    position,
    latestPrice: latestPriceRows[0] || null,
    trades,
    decisions
  }
}

function renderStateCell(rawState: any) {
  const state = typeof rawState === 'string' ? JSON.parse(rawState) : rawState
  if (!state || typeof state !== 'object') {
    return <span className="text-gray-400">N/A</span>
  }

  return (
    <div className="space-y-1 text-xs">
      {'rsi' in state && (
        <div>
          RSI: <span className="font-semibold">{Number(state.rsi).toFixed(1)}</span>
        </div>
      )}
      {'price' in state && (
        <div>
          Price: <span className="font-semibold">${Number(state.price).toFixed(2)}</span>
        </div>
      )}
      {'position_qty' in state && (
        <div>
          Position: <span className="font-semibold">{state.position_qty}</span>
        </div>
      )}
    </div>
  )
}

export default async function StockDetailPage({ params }: StockParams) {
  const data = await getStockData(params.symbol)

  if (!data) {
    notFound()
  }

  const { stock, position, latestPrice, trades, decisions } = data
  const lastPrice = position?.current_price ?? latestPrice?.close ?? 0
  const lastPriceTimestamp = position?.price_timestamp ?? latestPrice?.timestamp ?? null

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-6xl mx-auto space-y-8">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <p className="text-sm text-gray-500 mb-1">
              <Link href="/trades" className="text-blue-600 hover:underline">
                ← Back to trades
              </Link>
            </p>
            <h1 className="text-3xl font-bold text-gray-900">
              {stock.symbol}{' '}
              <span className="text-xl text-gray-500 font-normal">({stock.name})</span>
            </h1>
            {lastPriceTimestamp ? (
              <p className="text-gray-500 text-sm">
                Last price update: {new Date(lastPriceTimestamp).toLocaleString()}
              </p>
            ) : (
              <p className="text-gray-500 text-sm">No recent pricing data</p>
            )}
          </div>
          <div className="bg-white shadow rounded-lg p-4 text-right">
            <div className="text-sm text-gray-500 uppercase">Last Price</div>
            <div className="text-3xl font-bold text-gray-900">${Number(lastPrice).toFixed(2)}</div>
          </div>
        </div>

        <div className="bg-white shadow rounded-lg p-6">
          <h2 className="text-xl font-semibold mb-4">Current Position</h2>
          {position ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="border rounded-lg p-4">
                <div className="text-sm text-gray-500 uppercase mb-1">Quantity</div>
                <div className="text-2xl font-bold text-gray-900">{position.quantity}</div>
              </div>
              <div className="border rounded-lg p-4">
                <div className="text-sm text-gray-500 uppercase mb-1">Average Entry</div>
                <div className="text-2xl font-bold text-gray-900">${Number(position.avg_entry_price).toFixed(2)}</div>
              </div>
              <div className="border rounded-lg p-4">
                <div className="text-sm text-gray-500 uppercase mb-1">Market Value</div>
                <div className="text-2xl font-bold text-gray-900">${Number(position.market_value).toFixed(2)}</div>
                <div className={`text-sm ${Number(position.unrealized_pnl) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {Number(position.unrealized_pnl) >= 0 ? '+' : ''}
                  ${Number(position.unrealized_pnl).toFixed(2)} ({Number(position.unrealized_pnl_pct).toFixed(2)}%)
                </div>
              </div>
            </div>
          ) : (
            <p className="text-gray-500">No open position for this symbol.</p>
          )}
        </div>

        <div className="bg-white shadow rounded-lg p-6">
          <h2 className="text-xl font-semibold mb-4">Recent Trades</h2>
          {trades.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Time</th>
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
                      <td className={`px-4 py-3 font-semibold ${trade.action === 'BUY' ? 'text-green-600' : 'text-red-600'}`}>
                        {trade.action}
                      </td>
                      <td className="px-4 py-3 text-sm">{trade.quantity}</td>
                      <td className="px-4 py-3 text-sm">${Number(trade.price).toFixed(2)}</td>
                      <td className={`px-4 py-3 text-sm font-semibold ${Number(trade.profit_loss || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {trade.profit_loss ? `$${Number(trade.profit_loss).toFixed(2)}` : '-'}
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
          ) : (
            <p className="text-gray-500">No trades recorded for this symbol yet.</p>
          )}
        </div>

        <div className="bg-white shadow rounded-lg p-6">
          <h2 className="text-xl font-semibold mb-4">AI Decision Timeline</h2>
          {decisions.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Time</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Decision</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Executed?</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Reasoning</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">State Snapshot</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {decisions.map(decision => (
                    <tr key={decision.decision_id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {new Date(decision.timestamp).toLocaleString()}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`px-2 py-1 rounded text-xs font-medium ${
                            decision.was_random
                              ? 'bg-purple-100 text-purple-700'
                              : decision.action === 'BUY'
                              ? 'bg-green-100 text-green-700'
                              : decision.action === 'SELL'
                              ? 'bg-red-100 text-red-700'
                              : 'bg-gray-100 text-gray-600'
                          }`}
                        >
                          {decision.action}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm">
                        {decision.was_executed ? 'Executed' : 'Skipped'}
                        {decision.was_random && <span className="ml-2 text-xs text-purple-600">(Exploration)</span>}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700 max-w-md">
                        {decision.reasoning || '-'}
                      </td>
                      <td className="px-4 py-3">{renderStateCell(decision.state)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-gray-500">No AI decisions logged for this symbol yet.</p>
          )}
        </div>
      </div>
    </div>
  )
}
