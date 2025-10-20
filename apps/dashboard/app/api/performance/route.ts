/**
 * Performance API Route
 *
 * Fetches daily performance metrics
 */

import { query } from '@/lib/db'
import { NextResponse } from 'next/server'

// Force dynamic rendering - don't pre-render at build time
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    // Get daily performance metrics (last 30 days)
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

    // Get overall stats from bankroll
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

    return NextResponse.json({
      dailyMetrics: dailyMetrics || [],
      bankroll: bankroll[0] || null
    })
  } catch (error) {
    console.error('Performance API error:', error)
    return NextResponse.json({ error: 'Failed to fetch performance data' }, { status: 500 })
  }
}
