/**
 * Capital Discipline Page
 *
 * Provides visibility into cash usage, portfolio exposure, and indicator health.
 */

import { query, queryOne } from '@/lib/db'
import { formatCurrency, formatPercent } from '@/lib/format'
import { SurfaceCard } from '@/components/ui/SurfaceCard'
import { MetricStat } from '@/components/ui/MetricStat'
import { StatusBadge } from '@/components/ui/StatusBadge'
import CapitalPipelineStatus from '@/components/CapitalPipelineStatus'

export const dynamic = 'force-dynamic'

type DecisionMixRow = {
  cash_bucket: string | null
  exposure_bucket: string | null
  action: string
  decisions: string
  executed_buy_count: string | null
}

type ExposureRow = {
  total_cost_basis: string
  total_market_value: string
}

type CashRow = {
  balance: string
}

type IndicatorRow = {
  symbol: string
  recent_bars: string | null
  has_sma: boolean | null
  has_rsi: boolean | null
}

type DecisionSummary = {
  totalDecisions: number
  cashBuckets: Array<{ bucket: string; count: number; percentage: number }>
  mixMatrix: Array<{
    cashBucket: string
    exposureBucket: string
    action: string
    count: number
    executedBuyCount: number
  }>
}

type ExposureSummary = {
  totalCostBasis: number
  totalMarketValue: number
  cashBalance: number
  exposureRatio: number
  marketValueRatio: number
}

type IndicatorSummary = Array<{
  symbol: string
  recentBars: number
  hasSma: boolean
  hasRsi: boolean
}>

interface CapitalMetrics {
  decisions: DecisionSummary
  exposure: ExposureSummary
  indicators: IndicatorSummary
}

const exposureBucketPalette: Record<string, string> = {
  NONE: 'bg-emerald-400',
  LIGHT: 'bg-sky-400',
  HEAVY: 'bg-amber-400',
  OVEREXTENDED: 'bg-rose-500',
  UNKNOWN: 'bg-slate-400',
}

function normalizeBucket(input: string | null, fallback: string) {
  if (!input) return fallback
  return input.toUpperCase()
}

async function getCapitalMetrics(): Promise<CapitalMetrics> {
  const [decisionRows, exposureRows, cashRow, indicatorRows] = await Promise.all([
    query<DecisionMixRow>(`
      SELECT
        state->>'cash_bucket' AS cash_bucket,
        state->>'exposure_bucket' AS exposure_bucket,
        action,
        COUNT(*) AS decisions,
        SUM(CASE WHEN action = 'BUY' AND was_executed THEN 1 ELSE 0 END) AS executed_buy_count
      FROM trade_decisions_log
      WHERE timestamp::date = CURRENT_DATE
      GROUP BY 1, 2, 3
    `),
    query<ExposureRow>(`
      SELECT
        COALESCE(SUM(cost_basis), 0) AS total_cost_basis,
        COALESCE(SUM(market_value), 0) AS total_market_value
      FROM active_positions_with_market_value
    `),
    queryOne<CashRow>(`
      SELECT balance
      FROM paper_bankroll
      LIMIT 1
    `),
    query<IndicatorRow>(`
      SELECT
        s.symbol,
        (
          SELECT COUNT(*)
          FROM price_snapshots ps
          WHERE ps.stock_id = s.stock_id
            AND ps.timestamp >= NOW() - INTERVAL '3 days'
        ) AS recent_bars,
        EXISTS (
          SELECT 1
          FROM technical_indicators ti
          WHERE ti.stock_id = s.stock_id
            AND ti.indicator_name = 'SMA_50'
        ) AS has_sma,
        EXISTS (
          SELECT 1
          FROM technical_indicators ti
          WHERE ti.stock_id = s.stock_id
            AND ti.indicator_name = 'RSI'
        ) AS has_rsi
      FROM stocks s
      WHERE EXISTS (SELECT 1 FROM price_snapshots ps WHERE ps.stock_id = s.stock_id)
      ORDER BY s.symbol
    `),
  ])

  const totalDecisions = decisionRows.reduce((acc, row) => acc + Number(row.decisions || 0), 0)

  const cashBucketsMap = new Map<string, number>()
  decisionRows.forEach((row) => {
    const bucket = normalizeBucket(row.cash_bucket, 'UNKNOWN')
    cashBucketsMap.set(bucket, (cashBucketsMap.get(bucket) || 0) + Number(row.decisions || 0))
  })

  const cashBuckets = Array.from(cashBucketsMap.entries()).map(([bucket, count]) => ({
    bucket,
    count,
    percentage: totalDecisions > 0 ? (count / totalDecisions) * 100 : 0,
  })).sort((a, b) => b.count - a.count)

  const mixMatrix = decisionRows.map((row) => ({
    cashBucket: normalizeBucket(row.cash_bucket, 'UNKNOWN'),
    exposureBucket: normalizeBucket(row.exposure_bucket, 'UNKNOWN'),
    action: row.action.toUpperCase(),
    count: Number(row.decisions || 0),
    executedBuyCount: Number(row.executed_buy_count || 0),
  }))

  const exposureRow = exposureRows[0] || { total_cost_basis: '0', total_market_value: '0' }
  const cashBalance = cashRow ? Number(cashRow.balance || 0) : 0
  const totalCostBasis = Number(exposureRow.total_cost_basis || 0)
  const totalMarketValue = Number(exposureRow.total_market_value || 0)

  const exposureSummary: ExposureSummary = {
    totalCostBasis,
    totalMarketValue,
    cashBalance,
    exposureRatio: cashBalance > 0 ? totalCostBasis / cashBalance : 0,
    marketValueRatio: cashBalance > 0 ? totalMarketValue / cashBalance : 0,
  }

  const indicators: IndicatorSummary = indicatorRows.map((row) => ({
    symbol: row.symbol,
    recentBars: Number(row.recent_bars || 0),
    hasSma: Boolean(row.has_sma),
    hasRsi: Boolean(row.has_rsi),
  }))

  return {
    decisions: {
      totalDecisions,
      cashBuckets,
      mixMatrix,
    },
    exposure: exposureSummary,
    indicators,
  }
}

export default async function CapitalDisciplinePage() {
  const metrics = await getCapitalMetrics()

  const totalDecisions = metrics.decisions.totalDecisions
  const exposuresByCash = new Map<string, Array<{ bucket: string; count: number; percentage: number }>>()
  const actionsByCash = new Map<string, Array<{ action: string; count: number; executedCount: number }>>()

  metrics.decisions.mixMatrix.forEach((row) => {
    const exposures = exposuresByCash.get(row.cashBucket) || []
    const exposureIndex = exposures.findIndex((item) => item.bucket === row.exposureBucket)
    if (exposureIndex >= 0) {
      exposures[exposureIndex].count += row.count
    } else {
      exposures.push({ bucket: row.exposureBucket, count: row.count, percentage: 0 })
    }
    exposuresByCash.set(row.cashBucket, exposures)

    const actions = actionsByCash.get(row.cashBucket) || []
    const existingAction = actions.find((item) => item.action === row.action)
    const executedCount = row.executedBuyCount || 0
    if (existingAction) {
      existingAction.count += row.count
      if (row.action === 'BUY') {
        existingAction.executedCount += executedCount
      }
    } else {
      actions.push({
        action: row.action,
        count: row.count,
        executedCount,
      })
    }
    actionsByCash.set(row.cashBucket, actions)
  })

  exposuresByCash.forEach((entries, cashBucket) => {
    const cashBucketTotal = entries.reduce((acc, item) => acc + item.count, 0)
    entries.forEach((item) => {
      item.percentage = cashBucketTotal > 0 ? (item.count / cashBucketTotal) * 100 : 0
    })
    exposuresByCash.set(
      cashBucket,
      entries.sort((a, b) => b.percentage - a.percentage),
    )
  })

  const exposureRatioPct = metrics.exposure.exposureRatio * 100
  const marketValueRatioPct = metrics.exposure.marketValueRatio * 100

  const exposureSeverity = exposureRatioPct >= 110
    ? 'negative'
    : exposureRatioPct >= 95
      ? 'warning'
      : 'positive'

  const exposureMetricTone = exposureSeverity === 'negative' ? 'negative' : exposureSeverity === 'warning' ? 'muted' : 'positive'

  const cashAlerts = metrics.decisions.cashBuckets
    .filter((bucket) => bucket.bucket === 'LOW' && bucket.percentage >= 40)
    .map((bucket) => bucket.bucket)

  const exposureAlerts = Array.from(exposuresByCash.entries())
    .filter(([_, entries]) => {
      const overextended = entries.find((item) => item.bucket === 'OVEREXTENDED')
      return overextended && overextended.percentage >= 20
    })
    .map(([cashBucket]) => cashBucket)

  const indicatorRows = metrics.indicators
    .slice()
    .sort((a, b) => b.recentBars - a.recentBars)

  return (
    <div className="min-h-screen bg-brand-background p-6 md:p-10">
      <div className="mx-auto flex max-w-6xl flex-col gap-8">
        <SurfaceCard
          padding="lg"
          className="bg-brand-gradient text-white"
        >
          <h1 className="text-3xl font-semibold text-brand-glow">Capital Discipline</h1>
          <p className="mt-2 text-sm text-white/80">
            Cash usage, exposure, and indicator diagnostics from today&apos;s trading sessions.
          </p>
          <p className="mt-4 text-xs text-white/70">
            Total decisions recorded today: {totalDecisions}
          </p>
          {(cashAlerts.length > 0 || exposureAlerts.length > 0) && (
            <div className="mt-4 rounded-lg border border-amber-200/60 bg-amber-100/20 p-4 text-xs text-amber-50">
              <p className="font-semibold uppercase tracking-wide text-amber-100">Attention</p>
              {cashAlerts.length > 0 && (
                <p className="mt-1 text-amber-50">
                  Cash bucket skewed LOW ({cashAlerts.join(', ')}). Review buy penalties or bankroll allocation.
                </p>
              )}
              {exposureAlerts.length > 0 && (
                <p className="mt-1 text-amber-50">
                  Exposure bucket frequently OVEREXTENDED when cash bucket is {exposureAlerts.join(', ')}.
                </p>
              )}
            </div>
          )}
        </SurfaceCard>

        <div className="grid gap-6 lg:grid-cols-[2fr,1fr]">
          <SurfaceCard className="space-y-6">
            <div>
              <h2 className="text-xl font-semibold text-slate-800">Decision Mix (Today)</h2>
              <p className="text-sm text-slate-500">
                Distribution of state buckets for all decisions logged today (executed and skipped).
              </p>
            </div>

            {totalDecisions === 0 ? (
              <p className="text-sm text-slate-500">Capital diagnostics will populate after the first trading cycle completes.</p>
            ) : (
              <div className="space-y-6">
                {metrics.decisions.cashBuckets.map((bucket) => {
                  const exposures = exposuresByCash.get(bucket.bucket) || []
                  const actions = actionsByCash.get(bucket.bucket) || []

                  return (
                    <div key={bucket.bucket} className="space-y-3 rounded-xl border border-brand-muted/60 bg-brand-muted/20 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="text-sm font-semibold text-slate-700 uppercase tracking-wide">
                          Cash: {bucket.bucket}
                        </div>
                        <div className="text-xs text-slate-500">
                          {bucket.count} decisions · {formatPercent(bucket.percentage)}
                        </div>
                      </div>

                      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
                        {exposures.map((exposure) => (
                          <div
                            key={exposure.bucket}
                            className={`${exposureBucketPalette[exposure.bucket] || 'bg-slate-400'} h-full`}
                            style={{ width: `${exposure.percentage}%` }}
                            title={`${exposure.bucket} · ${exposure.count} decisions`}
                          />
                        ))}
                      </div>

                      <div className="flex flex-wrap gap-3 text-xs text-slate-600">
                        {exposures.map((exposure) => (
                          <div key={`${bucket.bucket}-${exposure.bucket}`} className="flex items-center gap-2 rounded-full bg-white/60 px-3 py-1">
                            <span className={`h-2 w-2 rounded-full ${exposureBucketPalette[exposure.bucket] || 'bg-slate-400'}`} />
                            <span className="font-semibold">{exposure.bucket}</span>
                            <span>{exposure.count}</span>
                            <span className="text-slate-400">{formatPercent(exposure.percentage)}</span>
                          </div>
                        ))}
                      </div>

                      <div className="flex flex-wrap gap-3 text-xs text-slate-500">
                        {actions.map((action) => (
                          <div key={`${bucket.bucket}-${action.action}`} className="rounded-full bg-slate-100 px-3 py-1">
                            <span className="font-semibold text-slate-700">{action.action}</span>{' '}
                            <span>{action.count}</span>
                            {action.action === 'BUY' && (
                              <span className="text-slate-400">
                                {' '}· Executed {action.executedCount}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </SurfaceCard>

          <SurfaceCard className="flex flex-col gap-4">
            <div>
              <h2 className="text-xl font-semibold text-slate-800">Exposure Snapshot</h2>
              <p className="text-sm text-slate-500">Cash vs. capital deployed right now.</p>
            </div>
            <MetricStat
              label="Cash Balance"
              value={formatCurrency(metrics.exposure.cashBalance)}
              description="Current cash available"
            />
            <MetricStat
              label="Cost Basis Deployed"
              value={formatCurrency(metrics.exposure.totalCostBasis)}
              description={`${formatPercent(metrics.exposure.exposureRatio * 100)} of cash`}
              tone={exposureMetricTone}
            />
            <MetricStat
              label="Market Value Exposure"
              value={formatCurrency(metrics.exposure.totalMarketValue)}
              description={`${formatPercent(marketValueRatioPct)} of cash`}
              tone={exposureMetricTone}
            />
            <div className="space-y-2 text-xs text-slate-500">
              <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
                <div
                  className={`h-full ${exposureSeverity === 'negative' ? 'bg-rose-500' : exposureSeverity === 'warning' ? 'bg-amber-400' : 'bg-emerald-500'}`}
                  style={{ width: `${Math.min(exposureRatioPct, 150)}%` }}
                />
              </div>
              <p>
                Healthy range: 0–95%. Warnings at 95–110%, critical above 110%.
              </p>
            </div>
          </SurfaceCard>
        </div>

        <SurfaceCard className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold text-slate-800">Indicator Freshness</h2>
              <p className="text-sm text-slate-500">
                Bars counted over the last three days. A minimum of 50 bars is needed for intraday indicators.
              </p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-brand-muted/70 bg-brand-muted/40 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Symbol</th>
                  <th className="px-4 py-3">Recent Bars</th>
                  <th className="px-4 py-3">RSI</th>
                  <th className="px-4 py-3">SMA(50)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-muted/60 text-slate-600">
                {indicatorRows.map((row) => {
                  const hasEnoughBars = row.recentBars >= 50
                  return (
                    <tr key={row.symbol} className="odd:bg-brand-muted/20">
                      <td className="px-4 py-3 font-semibold text-slate-800">{row.symbol}</td>
                      <td className="px-4 py-3">
                        <StatusBadge tone={hasEnoughBars ? 'positive' : 'warning'}>
                          {row.recentBars}
                        </StatusBadge>
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge tone={row.hasRsi ? 'positive' : 'warning'}>
                          {row.hasRsi ? 'OK' : 'Missing'}
                        </StatusBadge>
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge tone={row.hasSma ? 'positive' : 'warning'}>
                          {row.hasSma ? 'OK' : 'Missing'}
                        </StatusBadge>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </SurfaceCard>

        <CapitalPipelineStatus />
      </div>
    </div>
  )
}
