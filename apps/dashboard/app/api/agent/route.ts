/**
 * Agent Stats API Route
 *
 * Fetches Q-Learning agent statistics and decision logs
 */

import { query } from '@/lib/db'
import { NextResponse } from 'next/server'

export async function GET() {
  try {
    // Get RL model states for each stock
    const modelStates = await query(`
      SELECT
        s.symbol,
        s.name,
        rms.model_type,
        rms.hyperparameters->>'total_episodes' as total_episodes,
        rms.hyperparameters->>'exploration_rate' as exploration_rate,
        rms.hyperparameters->>'avg_reward' as avg_reward,
        rms.updated_at
      FROM rl_model_states rms
      JOIN stocks s ON s.stock_id = rms.stock_id
      ORDER BY s.symbol
    `)

    // Get recent decision logs (last 50)
    const decisionLogs = await query(`
      SELECT
        s.symbol,
        tdl.state,
        tdl.action,
        tdl.was_random,
        tdl.q_values,
        tdl.timestamp
      FROM trade_decisions_log tdl
      JOIN stocks s ON s.stock_id = tdl.stock_id
      ORDER BY tdl.timestamp DESC
      LIMIT 50
    `)

    return NextResponse.json({
      modelStates: modelStates || [],
      decisionLogs: decisionLogs || []
    })
  } catch (error) {
    console.error('Agent API error:', error)
    return NextResponse.json({ error: 'Failed to fetch agent stats' }, { status: 500 })
  }
}
