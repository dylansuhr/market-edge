/**
 * Overview API Route
 *
 * Fetches key metrics: bankroll, active positions, recent trades
 */

import { query } from '@/lib/db'
import { NextResponse } from 'next/server'

// Force dynamic rendering - don't pre-render at build time
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    // Get bankroll stats
    const bankroll = await query(`
      SELECT
        balance,
        total_trades,
        total_pnl,
        roi,
        win_rate
      FROM paper_bankroll
      ORDER BY updated_at DESC
      LIMIT 1
    `)

    // Get active positions (from VIEW)
    const positions = await query(`
      SELECT
        ap.symbol,
        ap.quantity,
        ap.avg_entry_price as avg_price,
        (ap.quantity * ap.avg_entry_price) as current_value
      FROM active_positions ap
      WHERE ap.quantity > 0
      ORDER BY current_value DESC
    `)

    // Get recent trades (last 10)
    const recentTrades = await query(`
      SELECT
        s.symbol,
        pt.action,
        pt.quantity,
        pt.price,
        (pt.quantity * pt.price) as total_value,
        pt.profit_loss as pnl,
        pt.executed_at
      FROM paper_trades pt
      JOIN stocks s ON s.stock_id = pt.stock_id
      ORDER BY pt.executed_at DESC
      LIMIT 10
    `)

    return NextResponse.json({
      bankroll: bankroll[0] || null,
      positions: positions || [],
      recentTrades: recentTrades || []
    })
  } catch (error) {
    console.error('Overview API error:', error)
    return NextResponse.json({ error: 'Failed to fetch overview data' }, { status: 500 })
  }
}
