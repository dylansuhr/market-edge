/**
 * Performance Page
 *
 * Daily performance metrics and statistics
 */

import { query } from '@/lib/db'
import { formatCurrency, formatPercent } from '@/lib/format'
import { tooltips } from '@/lib/tooltips'
import { InfoTooltip } from '@/components/ui/InfoTooltip'
import { SurfaceCard } from '@/components/ui/SurfaceCard'
import { MetricStat } from '@/components/ui/MetricStat'
import { StatusBadge } from '@/components/ui/StatusBadge'

export const dynamic = 'force-dynamic'

async function getPerformanceData() {
  const dailyMetrics = await query(`
    SELECT
      date,
      total_trades,
      winning_trades,
      losing_trades,
      win_rate,
      total_pnl,
      avg_win,
      avg_loss,
      sharpe_ratio,
      max_drawdown
    FROM performance_metrics
    ORDER BY date DESC
    LIMIT 30
  `)

  return {
    dailyMetrics: dailyMetrics || []
  }
}

export default async function PerformancePage() {
  const data = await getPerformanceData()
  const latest = data.dailyMetrics[0] as any | undefined
  const latestWinRate = latest ? Number.parseFloat(String(latest.win_rate ?? 0)) * 100 : null
  const latestPnl = latest ? Number.parseFloat(String(latest.total_pnl ?? 0)) : null

  return (
    <div className="min-h-screen bg-brand-background p-6 md:p-10">
      <div className="mx-auto flex max-w-6xl flex-col gap-8">
        <SurfaceCard
          padding="lg"
          className="bg-brand-gradient text-white"
        >
          <h1 className="text-3xl font-semibold text-brand-glow">Performance Metrics</h1>
          <p className="mt-2 text-sm text-white/80">
            Daily execution stats and edge diagnostics from the analytics pipeline.
          </p>
          {latest ? (
            <div className="mt-6 grid gap-4 md:grid-cols-3">
              <MetricStat
                label={`Latest Session · ${latest.date}`}
                value={latestPnl !== null ? formatCurrency(latestPnl) : '–'}
                description="Total P&L"
                tone={latestPnl !== null ? (latestPnl >= 0 ? 'positive' : 'negative') : 'muted'}
                tooltip={tooltips.totalPnL}
              />
              <MetricStat
                label="Win Rate"
                value={latestWinRate !== null ? `${latestWinRate.toFixed(1)}%` : '–'}
                description={`${latest.total_trades} trades`}
                tooltip={tooltips.winRate}
              />
              <MetricStat
                label="Sharpe Ratio"
                value={latest.sharpe_ratio ? parseFloat(latest.sharpe_ratio).toFixed(2) : '–'}
                description={latest.max_drawdown ? `Max drawdown ${(parseFloat(latest.max_drawdown) * 100).toFixed(1)}%` : undefined}
                tone="muted"
                tooltip={tooltips.sharpeRatio}
              />
            </div>
          ) : (
            <p className="mt-6 text-sm text-white/80">
              Analytics will populate after the first full trading day completes.
            </p>
          )}
        </SurfaceCard>

        <SurfaceCard className="overflow-hidden">
          <h2 className="mb-4 text-xl font-semibold text-slate-800">Daily Performance (Last 30 Days)</h2>
          {data.dailyMetrics.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="border-b border-brand-muted bg-brand-muted/40">
                  <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3 flex items-center">
                      Trades
                      <InfoTooltip content={tooltips.totalTrades} position="right" />
                    </th>
                    <th className="px-4 py-3">Wins</th>
                    <th className="px-4 py-3">Losses</th>
                    <th className="px-4 py-3 flex items-center">
                      Win Rate
                      <InfoTooltip content={tooltips.winRate} position="right" />
                    </th>
                    <th className="px-4 py-3 flex items-center">
                      Total P&L
                      <InfoTooltip content={tooltips.totalPnL} position="right" />
                    </th>
                    <th className="px-4 py-3 flex items-center">
                      Avg Win
                      <InfoTooltip content={tooltips.avgWin} position="right" />
                    </th>
                    <th className="px-4 py-3 flex items-center">
                      Avg Loss
                      <InfoTooltip content={tooltips.avgLoss} position="right" />
                    </th>
                    <th className="px-4 py-3 flex items-center">
                      Sharpe Ratio
                      <InfoTooltip content={tooltips.sharpeRatio} position="right" />
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-brand-muted text-sm text-slate-600">
                  {data.dailyMetrics.map((metric: any) => {
                    const winRate = parseFloat(metric.win_rate) * 100
                    const pnl = parseFloat(metric.total_pnl)
                    return (
                      <tr key={metric.date} className="odd:bg-brand-muted/30 transition-colors hover:bg-brand-muted/40">
                        <td className="px-4 py-3 font-semibold text-slate-800">{metric.date}</td>
                        <td className="px-4 py-3">{metric.total_trades.toLocaleString()}</td>
                        <td className="px-4 py-3 text-emerald-600">{metric.winning_trades.toLocaleString()}</td>
                        <td className="px-4 py-3 text-rose-500">{metric.losing_trades.toLocaleString()}</td>
                        <td className="px-4 py-3">{formatPercent(winRate)}</td>
                        <td className="px-4 py-3">
                          <StatusBadge tone={pnl >= 0 ? 'positive' : 'negative'} className="font-semibold">
                            {formatCurrency(pnl)}
                          </StatusBadge>
                        </td>
                        <td className="px-4 py-3 text-emerald-600">
                          {metric.avg_win ? formatCurrency(parseFloat(metric.avg_win)) : '–'}
                        </td>
                        <td className="px-4 py-3 text-rose-500">
                          {metric.avg_loss ? formatCurrency(parseFloat(metric.avg_loss)) : '–'}
                        </td>
                        <td className="px-4 py-3">
                          {metric.sharpe_ratio ? parseFloat(metric.sharpe_ratio).toFixed(2) : '–'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-slate-500">
              Daily performance metrics will appear here once the post-settlement analytics job is enabled. Core portfolio statistics are available on the Overview page.
            </p>
          )}
        </SurfaceCard>
      </div>
    </div>
  )
}
