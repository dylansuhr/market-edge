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
    const limit = searchParams.get('limit') || '100'
    const symbol = searchParams.get('symbol') || null

    let decisions

    if (symbol) {
      // Filter by symbol
      decisions = await query(`
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
        WHERE s.symbol = $1
        ORDER BY tdl.timestamp DESC
        LIMIT $2
      `, [symbol, limit])
    } else {
      // All decisions
      decisions = await query(`
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
        ORDER BY tdl.timestamp DESC
        LIMIT $1
      `, [limit])
    }

    // Parse JSON fields
    const parsedDecisions = decisions.map((d: any) => ({
      ...d,
      state: typeof d.state === 'string' ? JSON.parse(d.state) : d.state,
      q_values: d.q_values && typeof d.q_values === 'string' ? JSON.parse(d.q_values) : d.q_values
    }))

    return NextResponse.json({ decisions: parsedDecisions })
  } catch (error) {
    console.error('AI Log API error:', error)
    return NextResponse.json({ error: 'Failed to fetch AI decision log' }, { status: 500 })
  }
}
