/**
 * Capital Discipline Page
 *
 * Provides visibility into cash usage, portfolio exposure, and reward health.
 */

import { query, queryOne } from '@/lib/db'
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
  avg_buy_reward: string | null
  executed_buy_count: string | null
  executed_buy_reward_sum: string | null
}

type BuyRewardRow = {
  timestamp: string
  reward: string
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
    avgBuyReward: number | null
  }>
  buyRewards: Array<{ timestamp: string; reward: number; rollingAvg: number }>
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

function computeRollingAverage(values: Array<{ timestamp: string; reward: number }>, window = 5) {
  const result: Array<{ timestamp: string; reward: number; rollingAvg: number }> = []
  const buffer: number[] = []

  values.forEach((entry) => {
    buffer.push(entry.reward)
    if (buffer.length > window) {
      buffer.shift()
    }
    const rollingAvg = buffer.reduce((acc, val) => acc + val, 0) / buffer.length
    result.push({
      timestamp: entry.timestamp,
      reward: entry.reward,
      rollingAvg,
    })
  })

  return result
}

async function getCapitalMetrics(): Promise<CapitalMetrics> {
  const [decisionRows, buyRewardRows, exposureRows, cashRow, indicatorRows] = await Promise.all([
    query<DecisionMixRow>(`
      SELECT
        state->>'cash_bucket' AS cash_bucket,
        state->>'exposure_bucket' AS exposure_bucket,
        action,
        COUNT(*) AS decisions,
        AVG(CASE WHEN action = 'BUY' AND was_executed THEN COALESCE(reward, 0) ELSE NULL END) AS avg_buy_reward,
        SUM(CASE WHEN action = 'BUY' AND was_executed THEN 1 ELSE 0 END) AS executed_buy_count,
        SUM(CASE WHEN action = 'BUY' AND was_executed THEN COALESCE(reward, 0) ELSE 0 END) AS executed_buy_reward_sum
      FROM trade_decisions_log
      WHERE timestamp::date = CURRENT_DATE
      GROUP BY 1, 2, 3
    `),
    query<BuyRewardRow>(`
      SELECT
        timestamp AT TIME ZONE 'UTC' AS timestamp,
        reward
      FROM trade_decisions_log
      WHERE action = 'BUY'
        AND was_executed = TRUE
        AND reward IS NOT NULL
        AND timestamp::date = CURRENT_DATE
      ORDER BY timestamp ASC
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
    avgBuyReward: row.avg_buy_reward !== null ? Number(row.avg_buy_reward) : null,
    executedBuyCount: Number(row.executed_buy_count || 0),
    executedBuyRewardSum: Number(row.executed_buy_reward_sum || 0),
  }))

  const buyRewardsRaw = buyRewardRows.map((row) => ({
    timestamp: row.timestamp,
    reward: Number(row.reward),
  }))

  const rollingRewards = computeRollingAverage(buyRewardsRaw, 5)

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
      buyRewards: rollingRewards,
    },
    exposure: exposureSummary,
    indicators,
  }
}

export default async function CapitalDisciplinePage() {
  const metrics = await getCapitalMetrics()

  const totalDecisions = metrics.decisions.totalDecisions
  const exposuresByCash = new Map<string, Array<{ bucket: string; count: number; percentage: number }>>()
  const actionsByCash = new Map<string, Array<{ action: string; count: number; avgReward: number | null; executedCount: number; executedRewardSum: number }>>()

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
    const executedRewardSum = row.executedBuyRewardSum || 0
    if (existingAction) {
      existingAction.count += row.count
      if (row.action === 'BUY') {
        existingAction.executedCount += executedCount
        existingAction.executedRewardSum += executedRewardSum
        existingAction.avgReward = existingAction.executedCount > 0
          ? existingAction.executedRewardSum / existingAction.executedCount
          : null
      }
    } else {
      actions.push({
        action: row.action,
        count: row.count,
        executedCount,
        executedRewardSum,
        avgReward: row.action === 'BUY' && executedCount > 0 ? executedRewardSum / executedCount : null,
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

  const latestRollingReward = metrics.decisions.buyRewards.length > 0
    ? metrics.decisions.buyRewards[metrics.decisions.buyRewards.length - 1].rollingAvg
    : null

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

  const buyRewardSpark = metrics.decisions.buyRewards.slice(-20)

  return (
    <div className="min-h-screen bg-brand-background p-6 md:p-10">
      <div className="mx-auto flex max-w-6xl flex-col gap-8">
        <SurfaceCard
          padding="lg"
          className="bg-brand-gradient text-white"
        >
          <h1 className="text-3xl font-semibold text-brand-glow">Capital Discipline</h1>
          <p className="mt-2 text-sm text-white/80">
            Cash usage, exposure, and reward diagnostics from today&apos;s trading sessions.
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
                          {bucket.count} decisions · {bucket.percentage.toFixed(1)}%
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
                            <span className="text-slate-400">{exposure.percentage.toFixed(1)}%</span>
                          </div>
                        ))}
                      </div>

                      <div className="flex flex-wrap gap-3 text-xs text-slate-500">
                        {actions.map((action) => (
                          <div key={`${bucket.bucket}-${action.action}`} className="rounded-full bg-slate-100 px-3 py-1">
                            <span className="font-semibold text-slate-700">{action.action}</span>{' '}
                            <span>{action.count}</span>
                            {action.action === 'BUY' && action.avgReward !== null && (
                              <span className={action.avgReward >= 0 ? 'text-emerald-600' : 'text-rose-500'}>
                                {' '}· Avg reward {action.avgReward.toFixed(2)} ({action.executedCount} exec)
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
              value={`$${metrics.exposure.cashBalance.toFixed(2)}`}
              description="Current cash available"
            />
            <MetricStat
              label="Cost Basis Deployed"
              value={`$${metrics.exposure.totalCostBasis.toFixed(2)}`}
              description={`${(metrics.exposure.exposureRatio * 100).toFixed(1)}% of cash`}
              tone={exposureMetricTone}
            />
            <MetricStat
              label="Market Value Exposure"
              value={`$${metrics.exposure.totalMarketValue.toFixed(2)}`}
              description={`${marketValueRatioPct.toFixed(1)}% of cash`}
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

        <SurfaceCard className="space-y-6">
          <div>
            <h2 className="text-xl font-semibold text-slate-800">Buy Reward Trend</h2>
            <p className="text-sm text-slate-500">
              Rolling 5-decision average for executed BUY rewards (today).
            </p>
          </div>

          {buyRewardSpark.length === 0 ? (
            <p className="text-sm text-slate-500">
              Rewards will appear after the trading agent executes the first BUY decision today.
            </p>
          ) : (
            <div className="flex flex-col gap-4">
              <Sparkline data={buyRewardSpark} />
              <div className="flex flex-wrap items-center gap-3 text-sm text-slate-600">
                <StatusBadge tone={latestRollingReward !== null && latestRollingReward >= 0 ? 'positive' : 'warning'}>
                  Latest rolling average: {latestRollingReward?.toFixed(2)}
                </StatusBadge>
                <span className="text-xs text-slate-400">
                  Target range: -0.02 to -0.08 · adjust penalties if rolling average drifts below -0.10
                </span>
              </div>
            </div>
          )}
        </SurfaceCard>

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

type SparklineProps = {
  data: Array<{ timestamp: string; reward: number; rollingAvg: number }>
}

function Sparkline({ data }: SparklineProps) {
  if (data.length === 0) {
    return null
  }

  const rewards = data.map((point) => point.rollingAvg)
  const min = Math.min(...rewards, -0.2)
  const max = Math.max(...rewards, 0.2)
  const range = max - min || 1

  const points = data.map((point, index) => {
    const x = (index / (data.length - 1 || 1)) * 100
    const y = ((max - point.rollingAvg) / range) * 100
    return `${x},${y}`
  }).join(' ')

  return (
    <svg viewBox="0 0 100 100" className="h-32 w-full rounded-xl border border-brand-muted/60 bg-white p-4">
      <polyline
        fill="none"
        strokeWidth="2"
        stroke="url(#rewardGradient)"
        points={points}
      />
      <defs>
        <linearGradient id="rewardGradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#34d399" />
          <stop offset="100%" stopColor="#f97316" />
        </linearGradient>
      </defs>
    </svg>
  )
}
