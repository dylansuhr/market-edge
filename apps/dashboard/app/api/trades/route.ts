/**
 * Trades API Route
 *
 * Fetches all paper trades with filtering options
 */

import { query } from '@/lib/db'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const limit = searchParams.get('limit') || '100'

    const trades = await query(`
      SELECT
        pt.trade_id as id,
        s.symbol,
        s.name,
        pt.action,
        pt.quantity,
        pt.price,
        (pt.quantity * pt.price) as total_value,
        pt.profit_loss as pnl,
        pt.strategy,
        pt.reasoning,
        pt.executed_at
      FROM paper_trades pt
      JOIN stocks s ON s.stock_id = pt.stock_id
      ORDER BY pt.executed_at DESC
      LIMIT $1
    `, [limit])

    return NextResponse.json({ trades })
  } catch (error) {
    console.error('Trades API error:', error)
    return NextResponse.json({ error: 'Failed to fetch trades' }, { status: 500 })
  }
}
