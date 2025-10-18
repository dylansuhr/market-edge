/**
 * AI Decision Log API Route
 *
 * Fetches AI trading decisions from the trade_decisions_log table.
 * Provides full transparency into what the AI is thinking.
 */

import { query } from '@/lib/db'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const rawLimit = parseInt(searchParams.get('limit') || '50', 10)
    const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 100) : 50
    const symbol = searchParams.get('symbol')
    const statusParam = (searchParams.get('status') || 'all').toLowerCase()
    const cursorParam = searchParams.get('cursor')
    const cursor = cursorParam ? parseInt(cursorParam, 10) : null

    const decisions = await query(`
      SELECT
        tdl.decision_id,
        s.symbol,
        s.name,
        tdl.timestamp,
        tdl.state,
        tdl.action,
        tdl.was_executed,
        tdl.was_random,
        tdl.reasoning,
        tdl.q_values
      FROM trade_decisions_log tdl
      JOIN stocks s ON s.stock_id = tdl.stock_id
      WHERE ($1::text IS NULL OR s.symbol = $1)
        AND (
          CASE
            WHEN $2 = 'executed' THEN tdl.was_executed = TRUE
            WHEN $2 = 'skipped' THEN tdl.was_executed = FALSE
            WHEN $2 = 'exploration' THEN tdl.was_random = TRUE
            ELSE TRUE
          END
        )
        AND ($3::bigint IS NULL OR tdl.decision_id < $3)
      ORDER BY tdl.decision_id DESC
      LIMIT $4
    `, [symbol, statusParam, cursor, limit + 1])

    // Parse JSON fields
    const parsedDecisions = decisions.map((d: any) => ({
      ...d,
      state: typeof d.state === 'string' ? JSON.parse(d.state) : d.state,
      q_values: d.q_values && typeof d.q_values === 'string' ? JSON.parse(d.q_values) : d.q_values
    }))

    const hasMore = parsedDecisions.length > limit
    const items = hasMore ? parsedDecisions.slice(0, limit) : parsedDecisions
    const nextCursor = hasMore ? items[items.length - 1].decision_id : null

    return NextResponse.json({
      decisions: items,
      nextCursor
    })
  } catch (error) {
    console.error('AI Log API error:', error)
    return NextResponse.json({ error: 'Failed to fetch AI decision log' }, { status: 500 })
  }
}
