/**
 * Performance Page
 *
 * Daily performance metrics and statistics
 */

import { query } from '@/lib/db'

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

  return (
    <div>
      <h1 className="text-3xl font-bold mb-8">Performance Metrics</h1>

      {/* Daily Metrics */}
      <div className="bg-white shadow rounded-lg p-6">
        <h2 className="text-xl font-bold mb-4">Daily Performance (Last 30 Days)</h2>
        {data.dailyMetrics.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left border-b">
                  <th className="pb-2">Date</th>
                  <th className="pb-2">Trades</th>
                  <th className="pb-2">Wins</th>
                  <th className="pb-2">Losses</th>
                  <th className="pb-2">Win Rate</th>
                  <th className="pb-2">Total P&L</th>
                  <th className="pb-2">Avg Win</th>
                  <th className="pb-2">Avg Loss</th>
                  <th className="pb-2">Sharpe Ratio</th>
                </tr>
              </thead>
              <tbody>
                {data.dailyMetrics.map((metric: any) => (
                  <tr key={metric.date} className="border-b hover:bg-gray-50">
                    <td className="py-3">{metric.date}</td>
                    <td className="py-3">{metric.total_trades}</td>
                    <td className="py-3 text-green-600">{metric.winning_trades}</td>
                    <td className="py-3 text-red-600">{metric.losing_trades}</td>
                    <td className="py-3">{(parseFloat(metric.win_rate) * 100).toFixed(1)}%</td>
                    <td className={`py-3 font-semibold ${parseFloat(metric.total_pnl) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      ${parseFloat(metric.total_pnl).toFixed(2)}
                    </td>
                    <td className="py-3 text-green-600">
                      {metric.avg_win ? `$${parseFloat(metric.avg_win).toFixed(2)}` : '-'}
                    </td>
                    <td className="py-3 text-red-600">
                      {metric.avg_loss ? `$${parseFloat(metric.avg_loss).toFixed(2)}` : '-'}
                    </td>
                    <td className="py-3">
                      {metric.sharpe_ratio ? parseFloat(metric.sharpe_ratio).toFixed(2) : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-gray-500">
            <p className="mb-2">Daily performance metrics will appear here once the post-settlement analytics job is enabled.</p>
            <p className="text-sm">Core portfolio statistics are available on the Overview page.</p>
          </div>
        )}
      </div>
    </div>
  )
}
