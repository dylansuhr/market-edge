/**
 * Trades API Route
 *
 * Provides paginated trade history with optional filters.
 */

import { NextResponse } from 'next/server'
import { query } from '@/lib/db'

export const dynamic = 'force-dynamic'

type ActionFilter = 'BUY' | 'SELL' | null

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)

    const rawLimit = parseInt(searchParams.get('limit') || '50', 10)
    const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 100) : 50
    const cursorParam = searchParams.get('cursor')
    const cursor = cursorParam ? parseInt(cursorParam, 10) : null

    const symbolParam = searchParams.get('symbol')
    const symbol = symbolParam ? symbolParam.trim().toUpperCase() : null

    const actionParam = searchParams.get('action')
    const action: ActionFilter =
      actionParam && ['BUY', 'SELL'].includes(actionParam.toUpperCase())
        ? (actionParam.toUpperCase() as ActionFilter)
        : null

    const fromParam = searchParams.get('from')
    const toParam = searchParams.get('to')
    const fromDate = fromParam ? new Date(fromParam) : null
    const toDate = toParam ? new Date(toParam) : null

    const trades = await query(
      `
      SELECT
        pt.trade_id,
        s.symbol,
        s.name,
        pt.action,
        pt.quantity,
        pt.price,
        pt.strategy,
        pt.reasoning,
        pt.profit_loss,
        pt.executed_at,
        pt.exit_price,
        pt.status
      FROM paper_trades pt
      JOIN stocks s ON s.stock_id = pt.stock_id
      WHERE ($1::text IS NULL OR s.symbol = $1)
        AND ($2::text IS NULL OR pt.action = $2)
        AND ($3::timestamptz IS NULL OR pt.executed_at >= $3)
        AND ($4::timestamptz IS NULL OR pt.executed_at <= $4)
        AND ($5::bigint IS NULL OR pt.trade_id < $5)
      ORDER BY pt.trade_id DESC
      LIMIT $6
    `,
      [
        symbol,
        action,
        fromDate ? fromDate.toISOString() : null,
        toDate ? toDate.toISOString() : null,
        cursor,
        limit + 1
      ]
    )

    const hasMore = trades.length > limit
    const items = hasMore ? trades.slice(0, limit) : trades
    const nextCursor = hasMore ? items[items.length - 1].trade_id : null

    return NextResponse.json({
      trades: items,
      nextCursor
    })
  } catch (error) {
    console.error('Trades API error:', error)
    return NextResponse.json({ error: 'Failed to fetch trades' }, { status: 500 })
  }
}
