/**
 * AI Performance Page
 *
 * Chart-heavy visualization of Q-Learning agent performance,
 * demonstrating learning progression as exploration decays.
 */

import { query } from '@/lib/db'
import { formatCurrency, formatPercent } from '@/lib/format'
import { SurfaceCard } from '@/components/ui/SurfaceCard'
import PerformanceCharts from './PerformanceCharts'

export const dynamic = 'force-dynamic'

async function getPerformanceData() {
  // Overall portfolio metrics
  const portfolio = await query(`
    SELECT
      starting_cash,
      net_worth,
      total_pnl,
      total_roi,
      total_trades,
      win_rate
    FROM net_worth_summary
    LIMIT 1
  `)

  // Weekly performance progression (key learning evidence)
  const weeklyPerformance = await query(`
    SELECT
      DATE_TRUNC('week', executed_at)::date as week_start,
      COUNT(*) as trades,
      SUM(CASE WHEN profit_loss > 0 THEN 1 ELSE 0 END) as winning_trades,
      ROUND(100.0 * SUM(CASE WHEN profit_loss > 0 THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0), 2) as win_rate,
      ROUND(SUM(profit_loss)::numeric, 2) as weekly_pnl
    FROM paper_trades
    WHERE status = 'CLOSED'
    GROUP BY DATE_TRUNC('week', executed_at)
    ORDER BY week_start ASC
  `)

  // Per-stock performance
  const stockPerformance = await query(`
    SELECT
      s.symbol,
      COUNT(*) as trades,
      ROUND(100.0 * SUM(CASE WHEN pt.profit_loss > 0 THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0), 2) as win_rate,
      ROUND(SUM(pt.profit_loss)::numeric, 2) as total_pnl
    FROM paper_trades pt
    JOIN stocks s ON pt.stock_id = s.stock_id
    WHERE pt.status = 'CLOSED'
    GROUP BY s.symbol
    ORDER BY total_pnl DESC
  `)

  // Daily cumulative P&L for trend chart
  const dailyPnL = await query(`
    SELECT
      executed_at::date as date,
      ROUND(SUM(profit_loss)::numeric, 2) as daily_pnl,
      COUNT(*) as trades
    FROM paper_trades
    WHERE status = 'CLOSED'
    GROUP BY executed_at::date
    ORDER BY date ASC
  `)

  // Decision analysis (exploration vs exploitation) over time
  const weeklyDecisions = await query(`
    SELECT
      DATE_TRUNC('week', timestamp)::date as week_start,
      COUNT(*) as total_decisions,
      SUM(CASE WHEN was_random THEN 1 ELSE 0 END) as random_decisions,
      SUM(CASE WHEN NOT was_random THEN 1 ELSE 0 END) as learned_decisions,
      ROUND(100.0 * SUM(CASE WHEN was_random THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0), 2) as exploration_pct
    FROM trade_decisions_log
    GROUP BY DATE_TRUNC('week', timestamp)
    ORDER BY week_start ASC
  `)

  // Action distribution (BUY vs SELL ratio)
  const actionDistribution = await query(`
    SELECT
      action,
      COUNT(*) as count
    FROM paper_trades
    WHERE status = 'CLOSED'
    GROUP BY action
  `)

  // Overall exploration vs exploitation stats
  const overallExploration = await query(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN was_random THEN 1 ELSE 0 END) as exploration,
      SUM(CASE WHEN NOT was_random THEN 1 ELSE 0 END) as exploitation
    FROM trade_decisions_log
  `)

  // Weekly average epsilon for correlation chart
  const weeklyEpsilon = await query(`
    SELECT
      DATE_TRUNC('week', timestamp)::date as week_start,
      AVG((state->>'exploration_rate')::float) as avg_epsilon
    FROM trade_decisions_log
    WHERE state->>'exploration_rate' IS NOT NULL
    GROUP BY DATE_TRUNC('week', timestamp)
    ORDER BY week_start ASC
  `)

  // Calculate cumulative P&L
  let cumulative = 0
  const cumulativePnL = dailyPnL.map((d: any) => {
    cumulative += parseFloat(d.daily_pnl || 0)
    return {
      date: d.date,
      daily_pnl: parseFloat(d.daily_pnl || 0),
      cumulative_pnl: Math.round(cumulative * 100) / 100,
      trades: parseInt(d.trades)
    }
  })

  // Calculate trading period
  const firstTrade = await query(`
    SELECT MIN(executed_at)::date as first_date, MAX(executed_at)::date as last_date,
           COUNT(DISTINCT executed_at::date) as trading_days
    FROM paper_trades
  `)

  // Process action distribution
  const actions = {
    buy: parseInt(actionDistribution.find((a: any) => a.action === 'BUY')?.count || 0),
    sell: parseInt(actionDistribution.find((a: any) => a.action === 'SELL')?.count || 0)
  }
  const totalActions = actions.buy + actions.sell

  // Process overall exploration stats
  const exploration = overallExploration[0] || { total: 0, exploration: 0, exploitation: 0 }
  const explorationPct = exploration.total > 0
    ? (parseInt(exploration.exploration) / parseInt(exploration.total) * 100)
    : 0

  return {
    portfolio: portfolio[0] || null,
    weeklyPerformance: weeklyPerformance || [],
    stockPerformance: stockPerformance || [],
    cumulativePnL: cumulativePnL || [],
    weeklyDecisions: weeklyDecisions || [],
    tradingPeriod: firstTrade[0] || null,
    actionDistribution: actions,
    totalActions,
    explorationStats: {
      total: parseInt(exploration.total) || 0,
      exploration: parseInt(exploration.exploration) || 0,
      exploitation: parseInt(exploration.exploitation) || 0,
      explorationPct
    },
    weeklyEpsilon: weeklyEpsilon || []
  }
}

export default async function PerformancePage() {
  const data = await getPerformanceData()
  const portfolio = data.portfolio || {
    starting_cash: 100000,
    net_worth: 100000,
    total_pnl: 0,
    total_roi: 0,
    total_trades: 0,
    win_rate: 0
  }

  // Calculate early vs recent win rates for comparison
  const earlyWeeks = data.weeklyPerformance.slice(0, 3)
  const recentWeeks = data.weeklyPerformance.slice(-2)
  const earlyWinRate = earlyWeeks.length > 0
    ? earlyWeeks.reduce((sum: number, w: any) => sum + parseFloat(w.win_rate || 0), 0) / earlyWeeks.length
    : null
  const recentWinRate = recentWeeks.length > 0
    ? recentWeeks.reduce((sum: number, w: any) => sum + parseFloat(w.win_rate || 0), 0) / recentWeeks.length
    : null

  return (
    <div className="space-y-6">
      {/* Hero Section - Key Metrics */}
      <SurfaceCard className="bg-brand-gradient text-white" padding="lg">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-brand-glow">AI Learning Performance</h1>
            <p className="mt-1 text-sm text-white/70">
              {data.tradingPeriod?.trading_days || 0} trading days
              {data.tradingPeriod?.first_date && ` · ${new Date(data.tradingPeriod.first_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${new Date(data.tradingPeriod.last_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs uppercase tracking-wide text-white/60">Net Result</p>
            <p className={`text-3xl font-bold ${parseFloat(portfolio.total_pnl) >= 0 ? 'text-emerald-200' : 'text-rose-200'}`}>
              {formatCurrency(portfolio.total_pnl)}
            </p>
            <p className="text-sm text-white/70">{formatPercent(portfolio.total_roi, 2)} ROI</p>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
          <div className="rounded-xl bg-white/10 px-4 py-3">
            <p className="text-xs text-white/60">Total Trades</p>
            <p className="text-xl font-semibold">{portfolio.total_trades?.toLocaleString()}</p>
          </div>
          <div className="rounded-xl bg-white/10 px-4 py-3">
            <p className="text-xs text-white/60">Overall Win Rate</p>
            <p className="text-xl font-semibold">{formatPercent(portfolio.win_rate || 0)}</p>
          </div>
          <div className="rounded-xl bg-white/10 px-4 py-3">
            <p className="text-xs text-white/60">Win Rate Δ</p>
            <p className={`text-xl font-semibold ${(recentWinRate || 0) > (earlyWinRate || 0) ? 'text-emerald-200' : 'text-rose-200'}`}>
              {earlyWinRate && recentWinRate
                ? `${earlyWinRate.toFixed(0)}% → ${recentWinRate.toFixed(0)}%`
                : '–'}
            </p>
            <p className="text-xs text-white/50">early → recent</p>
          </div>
          <div className="rounded-xl bg-white/10 px-4 py-3">
            <p className="text-xs text-white/60">Profitable Stocks</p>
            <p className="text-xl font-semibold">
              {data.stockPerformance.filter((s: any) => parseFloat(s.total_pnl) > 0).length} / {data.stockPerformance.length}
            </p>
          </div>
          <div className="rounded-xl bg-white/10 px-4 py-3">
            <p className="text-xs text-white/60">Action Distribution</p>
            <p className="text-xl font-semibold">
              {data.totalActions > 0
                ? `${((data.actionDistribution.buy / data.totalActions) * 100).toFixed(0)}% BUY`
                : '–'}
            </p>
            <p className="text-xs text-white/50">
              {data.actionDistribution.buy.toLocaleString()} / {data.actionDistribution.sell.toLocaleString()}
            </p>
          </div>
          <div className="rounded-xl bg-white/10 px-4 py-3">
            <p className="text-xs text-white/60">Decision Mix</p>
            <p className="text-xl font-semibold text-orange-200">
              {data.explorationStats.explorationPct.toFixed(1)}% Explore
            </p>
            <p className="text-xs text-white/50">
              {data.explorationStats.total.toLocaleString()} decisions
            </p>
          </div>
        </div>
      </SurfaceCard>

      {/* All Charts */}
      <PerformanceCharts
        weeklyData={data.weeklyPerformance}
        cumulativeData={data.cumulativePnL}
        stockData={data.stockPerformance}
        weeklyDecisions={data.weeklyDecisions}
        weeklyEpsilon={data.weeklyEpsilon}
      />
    </div>
  )
}
