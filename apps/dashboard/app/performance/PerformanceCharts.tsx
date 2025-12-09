'use client'

import {
  LineChart,
  Line,
  BarChart,
  Bar,
  AreaChart,
  Area,
  ComposedChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
  Cell
} from 'recharts'
import { SurfaceCard } from '@/components/ui/SurfaceCard'

interface WeeklyData {
  week_start: string
  trades: number
  win_rate: number
  weekly_pnl: number
}

interface CumulativeData {
  date: string
  daily_pnl: number
  cumulative_pnl: number
  trades: number
}

interface StockData {
  symbol: string
  trades: number
  win_rate: number
  total_pnl: number
}

interface WeeklyDecisions {
  week_start: string
  total_decisions: number
  random_decisions: number
  learned_decisions: number
  exploration_pct: number
}

interface WeeklyEpsilon {
  week_start: string
  avg_epsilon: number
}

interface Props {
  weeklyData: WeeklyData[]
  cumulativeData: CumulativeData[]
  stockData: StockData[]
  weeklyDecisions: WeeklyDecisions[]
  weeklyEpsilon: WeeklyEpsilon[]
}

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(value)
}

const formatWeek = (dateStr: string) => {
  const date = new Date(dateStr)
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

const formatDate = (dateStr: string) => {
  const date = new Date(dateStr)
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

const COLORS = {
  purple: '#8b5cf6',
  green: '#10b981',
  red: '#ef4444',
  blue: '#3b82f6',
  orange: '#f97316',
  slate: '#64748b'
}

export default function PerformanceCharts({
  weeklyData,
  cumulativeData,
  stockData,
  weeklyDecisions,
  weeklyEpsilon
}: Props) {
  // Create epsilon lookup by week
  const epsilonByWeek = new Map(
    weeklyEpsilon.map(e => [e.week_start, parseFloat(String(e.avg_epsilon)) || 0])
  )

  // Prepare weekly chart data with epsilon correlation
  const weeklyChartData = weeklyData.map(w => ({
    week: formatWeek(w.week_start),
    winRate: parseFloat(String(w.win_rate)) || 0,
    pnl: parseFloat(String(w.weekly_pnl)) || 0,
    trades: w.trades,
    epsilon: epsilonByWeek.get(w.week_start) || null
  }))

  // Prepare cumulative chart data
  const cumulativeChartData = cumulativeData.map(d => ({
    date: formatDate(d.date),
    cumulative: d.cumulative_pnl,
    daily: d.daily_pnl
  }))

  // Prepare stock performance data
  const stockPnLData = stockData.map(s => ({
    symbol: s.symbol,
    pnl: parseFloat(String(s.total_pnl)) || 0
  })).sort((a, b) => b.pnl - a.pnl)

  const stockWinRateData = stockData.map(s => ({
    symbol: s.symbol,
    winRate: parseFloat(String(s.win_rate)) || 0
  })).sort((a, b) => b.winRate - a.winRate)

  // Prepare weekly decisions data (exploration vs exploitation)
  const decisionsChartData = weeklyDecisions.map(d => ({
    week: formatWeek(d.week_start),
    exploration: parseInt(String(d.random_decisions)) || 0,
    exploitation: parseInt(String(d.learned_decisions)) || 0,
    explorationPct: parseFloat(String(d.exploration_pct)) || 0
  }))

  return (
    <div className="grid gap-6 md:grid-cols-2">
      {/* 1. Win Rate vs Epsilon Correlation - THE KEY CHART */}
      <SurfaceCard className="md:col-span-2">
        <h3 className="text-lg font-semibold text-slate-800 mb-1">Win Rate vs Exploration Rate</h3>
        <p className="text-sm text-slate-500 mb-4">
          Core finding: Win rate improves as exploration (ε) decays — evidence of learning
        </p>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={weeklyChartData} margin={{ top: 10, right: 60, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="week" tick={{ fontSize: 12 }} stroke="#94a3b8" />
              <YAxis
                yAxisId="left"
                tick={{ fontSize: 12 }}
                stroke={COLORS.purple}
                tickFormatter={(v) => `${v}%`}
                domain={[0, 'auto']}
                label={{ value: 'Win Rate %', angle: -90, position: 'insideLeft', fontSize: 11, fill: COLORS.purple }}
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                tick={{ fontSize: 12 }}
                stroke={COLORS.orange}
                tickFormatter={(v) => `${(v * 100).toFixed(0)}%`}
                domain={[0.7, 1]}
                label={{ value: 'Epsilon (ε)', angle: 90, position: 'insideRight', fontSize: 11, fill: COLORS.orange }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'white',
                  border: '1px solid #e2e8f0',
                  borderRadius: '8px',
                  boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'
                }}
                formatter={(value: number, name: string) => {
                  if (name === 'Win Rate') return [`${value.toFixed(1)}%`, 'Win Rate']
                  if (name === 'Epsilon (ε)') return [`${(value * 100).toFixed(1)}%`, 'Epsilon (ε)']
                  return [value, name]
                }}
              />
              <Legend />
              <Bar yAxisId="left" dataKey="winRate" fill={COLORS.purple} radius={[4, 4, 0, 0]} name="Win Rate">
                {weeklyChartData.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={entry.winRate >= 20 ? COLORS.green : COLORS.purple}
                  />
                ))}
              </Bar>
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="epsilon"
                stroke={COLORS.orange}
                strokeWidth={3}
                dot={{ fill: COLORS.orange, strokeWidth: 2, r: 4 }}
                name="Epsilon (ε)"
                connectNulls
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <p className="mt-2 text-xs text-slate-400 text-center">
          As ε decreases (orange line), the agent exploits learned knowledge more — win rate increases (bars)
        </p>
      </SurfaceCard>

      {/* 2. Weekly P&L */}
      <SurfaceCard>
        <h3 className="text-lg font-semibold text-slate-800 mb-1">Weekly P&L</h3>
        <p className="text-sm text-slate-500 mb-4">Profit/loss per week</p>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={weeklyChartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="week" tick={{ fontSize: 11 }} stroke="#94a3b8" />
              <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" tickFormatter={(v) => formatCurrency(v)} />
              <Tooltip
                contentStyle={{ backgroundColor: 'white', border: '1px solid #e2e8f0', borderRadius: '8px' }}
                formatter={(value: number) => [formatCurrency(value), 'P&L']}
              />
              <ReferenceLine y={0} stroke="#94a3b8" />
              <Bar dataKey="pnl" name="Weekly P&L" radius={[4, 4, 0, 0]}>
                {weeklyChartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.pnl >= 0 ? COLORS.green : COLORS.red} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </SurfaceCard>

      {/* 3. Cumulative P&L */}
      <SurfaceCard>
        <h3 className="text-lg font-semibold text-slate-800 mb-1">Cumulative P&L</h3>
        <p className="text-sm text-slate-500 mb-4">Running total over time</p>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={cumulativeChartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 10 }}
                stroke="#94a3b8"
                interval={Math.floor(cumulativeChartData.length / 6)}
              />
              <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" tickFormatter={(v) => formatCurrency(v)} />
              <Tooltip
                contentStyle={{ backgroundColor: 'white', border: '1px solid #e2e8f0', borderRadius: '8px' }}
                formatter={(value: number) => [formatCurrency(value), 'Cumulative']}
              />
              <ReferenceLine y={0} stroke="#94a3b8" strokeDasharray="3 3" />
              <defs>
                <linearGradient id="colorCumulative" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={COLORS.purple} stopOpacity={0.3}/>
                  <stop offset="95%" stopColor={COLORS.purple} stopOpacity={0}/>
                </linearGradient>
              </defs>
              <Area
                type="monotone"
                dataKey="cumulative"
                stroke={COLORS.purple}
                strokeWidth={2}
                fill="url(#colorCumulative)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </SurfaceCard>

      {/* 4. Exploration vs Exploitation Over Time */}
      {decisionsChartData.length > 0 && (
        <SurfaceCard>
          <h3 className="text-lg font-semibold text-slate-800 mb-1">Exploration vs Exploitation</h3>
          <p className="text-sm text-slate-500 mb-4">Random vs learned decisions per week</p>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={decisionsChartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="week" tick={{ fontSize: 11 }} stroke="#94a3b8" />
                <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" />
                <Tooltip
                  contentStyle={{ backgroundColor: 'white', border: '1px solid #e2e8f0', borderRadius: '8px' }}
                />
                <Area
                  type="monotone"
                  dataKey="exploration"
                  stackId="1"
                  stroke={COLORS.orange}
                  fill={COLORS.orange}
                  fillOpacity={0.6}
                  name="Random (Exploration)"
                />
                <Area
                  type="monotone"
                  dataKey="exploitation"
                  stackId="1"
                  stroke={COLORS.blue}
                  fill={COLORS.blue}
                  fillOpacity={0.6}
                  name="Learned (Exploitation)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </SurfaceCard>
      )}

      {/* 5. P&L by Stock */}
      <SurfaceCard>
        <h3 className="text-lg font-semibold text-slate-800 mb-1">Total P&L by Stock</h3>
        <p className="text-sm text-slate-500 mb-4">Cumulative profit/loss per stock</p>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={stockPnLData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="symbol" tick={{ fontSize: 11 }} stroke="#94a3b8" />
              <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" tickFormatter={(v) => formatCurrency(v)} />
              <Tooltip
                contentStyle={{ backgroundColor: 'white', border: '1px solid #e2e8f0', borderRadius: '8px' }}
                formatter={(value: number) => [formatCurrency(value), 'Total P&L']}
              />
              <ReferenceLine y={0} stroke="#94a3b8" />
              <Bar dataKey="pnl" name="P&L" radius={[4, 4, 0, 0]}>
                {stockPnLData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.pnl >= 0 ? COLORS.green : COLORS.red} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </SurfaceCard>

      {/* 8. Win Rate by Stock */}
      <SurfaceCard>
        <h3 className="text-lg font-semibold text-slate-800 mb-1">Win Rate by Stock</h3>
        <p className="text-sm text-slate-500 mb-4">Percentage of profitable trades per stock</p>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={stockWinRateData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="symbol" tick={{ fontSize: 11 }} stroke="#94a3b8" />
              <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" tickFormatter={(v) => `${v}%`} domain={[0, 'auto']} />
              <Tooltip
                contentStyle={{ backgroundColor: 'white', border: '1px solid #e2e8f0', borderRadius: '8px' }}
                formatter={(value: number) => [`${value.toFixed(1)}%`, 'Win Rate']}
              />
              <Bar dataKey="winRate" fill={COLORS.purple} name="Win Rate" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </SurfaceCard>
    </div>
  )
}
