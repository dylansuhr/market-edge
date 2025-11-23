import Link from 'next/link'
import { notFound } from 'next/navigation'
import { query } from '@/lib/db'
import { formatCurrency, formatPercent } from '@/lib/format'
import { SurfaceCard } from '@/components/ui/SurfaceCard'
import { MetricStat } from '@/components/ui/MetricStat'
import { StatusBadge } from '@/components/ui/StatusBadge'

export const dynamic = 'force-dynamic'

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
    return <span className="text-slate-400">N/A</span>
  }

  return (
    <div className="space-y-1 text-xs text-slate-600">
      {'rsi' in state && (
        <div>
          RSI: <span className="font-semibold text-slate-800">{Number(state.rsi).toFixed(1)}</span>
        </div>
      )}
      {'price' in state && (
        <div>
          Price: <span className="font-semibold text-slate-800">${Number(state.price).toFixed(2)}</span>
        </div>
      )}
      {'position_qty' in state && (
        <div>
          Position: <span className="font-semibold text-slate-800">{state.position_qty}</span>
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
    <div className="min-h-screen bg-brand-background p-6 md:p-10">
      <div className="mx-auto flex max-w-6xl flex-col gap-8">
        <SurfaceCard
          padding="lg"
          className="flex flex-col gap-6 bg-brand-gradient text-white"
        >
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <Link href="/trades" className="text-sm font-medium text-white/80 transition hover:text-white">
                ← Back to trades
              </Link>
              <h1 className="mt-2 text-4xl font-semibold text-brand-glow">
                {stock.symbol}{' '}
                <span className="text-2xl font-normal text-white/80">{stock.name}</span>
              </h1>
              <p className="mt-2 text-sm text-white/80">
                {lastPriceTimestamp ? (
                  <>Last price update: {new Date(lastPriceTimestamp).toLocaleString()}</>
                ) : (
                  'No recent pricing data'
                )}
              </p>
            </div>
            <div className="rounded-3xl bg-white/15 px-6 py-5 text-right shadow-card">
              <p className="text-xs uppercase tracking-wide text-white/70">
                Last Price
              </p>
              <p className="mt-1 text-4xl font-semibold text-white">
                {formatCurrency(Number(lastPrice))}
              </p>
            </div>
          </div>
        </SurfaceCard>

        <SurfaceCard>
          <h2 className="mb-4 text-xl font-semibold text-slate-800">Current Position</h2>
          {position ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
              <MetricStat
                label="Quantity"
                value={position.quantity.toLocaleString()}
              />
              <MetricStat
                label="Average Entry"
                value={formatCurrency(Number(position.avg_entry_price))}
              />
              <MetricStat
                label="Market Value"
                value={formatCurrency(Number(position.market_value))}
              />
              <div className="flex flex-col gap-1">
                <span className="text-sm uppercase tracking-wide text-slate-400">
                  Unrealized P&amp;L
                </span>
                <StatusBadge tone={Number(position.unrealized_pnl) >= 0 ? 'positive' : 'negative'}>
                  {Number(position.unrealized_pnl) >= 0 ? '+' : ''}
                  {formatCurrency(Number(position.unrealized_pnl))} ({formatPercent(Number(position.unrealized_pnl_pct) * 100)})
                </StatusBadge>
              </div>
            </div>
          ) : (
            <p className="text-slate-500">No open position for this symbol.</p>
          )}
        </SurfaceCard>

        <SurfaceCard className="overflow-hidden">
          <h2 className="mb-4 text-xl font-semibold text-slate-800">Recent Trades</h2>
          {trades.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="border-b border-brand-muted bg-brand-muted/40">
                  <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="px-4 py-3">Time</th>
                    <th className="px-4 py-3">Action</th>
                    <th className="px-4 py-3">Qty</th>
                    <th className="px-4 py-3">Price</th>
                    <th className="px-4 py-3">P&amp;L</th>
                    <th className="px-4 py-3">Strategy</th>
                    <th className="px-4 py-3">Reasoning</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-brand-muted text-sm text-slate-600">
                  {trades.map(trade => (
                    <tr key={trade.trade_id} className="odd:bg-brand-muted/30 transition-colors hover:bg-brand-muted/40">
                      <td className="px-4 py-3 text-sm">
                        {new Date(trade.executed_at).toLocaleString()}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge tone={trade.action === 'BUY' ? 'positive' : 'negative'}>
                          {trade.action}
                        </StatusBadge>
                      </td>
                      <td className="px-4 py-3 text-sm">{trade.quantity.toLocaleString()}</td>
                      <td className="px-4 py-3 text-sm">{formatCurrency(Number(trade.price))}</td>
                      <td className="px-4 py-3">
                        {trade.profit_loss ? (
                          <StatusBadge
                            tone={Number(trade.profit_loss) >= 0 ? 'positive' : 'negative'}
                            className="font-semibold"
                          >
                            {formatCurrency(Number(trade.profit_loss))}
                          </StatusBadge>
                        ) : (
                          <span className="text-slate-400">–</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm">{trade.strategy || '-'}</td>
                      <td className="px-4 py-3 text-sm text-slate-600">
                        {trade.reasoning || '–'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-slate-500">No trades recorded for this symbol yet.</p>
          )}
        </SurfaceCard>

        <SurfaceCard className="overflow-hidden">
          <h2 className="mb-4 text-xl font-semibold text-slate-800">AI Decision Timeline</h2>
          {decisions.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="border-b border-brand-muted bg-brand-muted/40">
                  <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="px-4 py-3">Time</th>
                    <th className="px-4 py-3">Decision</th>
                    <th className="px-4 py-3">Executed?</th>
                    <th className="px-4 py-3">Reasoning</th>
                    <th className="px-4 py-3">State Snapshot</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-brand-muted text-sm text-slate-600">
                  {decisions.map(decision => (
                    <tr key={decision.decision_id} className="odd:bg-brand-muted/30 transition-colors hover:bg-brand-muted/40">
                      <td className="px-4 py-3 text-sm">
                        {new Date(decision.timestamp).toLocaleString()}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge tone={
                          decision.was_random
                            ? 'info'
                            : decision.action === 'BUY'
                            ? 'positive'
                            : decision.action === 'SELL'
                            ? 'negative'
                            : 'muted'
                        } className={decision.was_random ? 'bg-purple-100 text-purple-700' : undefined}>
                          {decision.was_random ? 'EXPLORE' : decision.action}
                        </StatusBadge>
                      </td>
                      <td className="px-4 py-3 text-sm">
                        {decision.was_executed ? (
                          <StatusBadge tone="positive">Executed</StatusBadge>
                        ) : (
                          <StatusBadge tone="muted">Skipped</StatusBadge>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600">
                        {decision.reasoning || '–'}
                      </td>
                      <td className="px-4 py-3">{renderStateCell(decision.state)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-slate-500">No AI decisions logged for this symbol yet.</p>
          )}
        </SurfaceCard>
      </div>
    </div>
  )
}
