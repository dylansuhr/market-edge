/**
 * Agent Page
 *
 * Educational view of the Q-Learning agent aligned with the final report.
 * Shows algorithm details, state space, reward structure, and per-stock status.
 */

import { query } from '@/lib/db'
import { SurfaceCard } from '@/components/ui/SurfaceCard'
import { StatusBadge } from '@/components/ui/StatusBadge'

export const dynamic = 'force-dynamic'

async function getAgentData() {
  // Get RL model states for each stock
  const modelStates = await query(`
    SELECT
      s.symbol,
      rms.hyperparameters->>'exploration_rate' as exploration_rate,
      rms.hyperparameters->>'exploration_decay' as exploration_decay,
      rms.hyperparameters->>'learning_rate' as learning_rate,
      rms.hyperparameters->>'discount_factor' as discount_factor,
      rms.hyperparameters->>'total_episodes' as total_episodes,
      rms.hyperparameters->>'total_rewards' as total_rewards,
      LENGTH(rms.q_table::text) as q_table_size,
      rms.updated_at
    FROM rl_model_states rms
    JOIN stocks s ON s.stock_id = rms.stock_id
    ORDER BY (rms.hyperparameters->>'exploration_rate')::float ASC
  `)

  // Get aggregate stats
  const aggStats = await query(`
    SELECT
      COUNT(*) as total_decisions,
      SUM(CASE WHEN was_random THEN 1 ELSE 0 END) as random_decisions,
      SUM(CASE WHEN NOT was_random THEN 1 ELSE 0 END) as learned_decisions
    FROM trade_decisions_log
  `)

  // Get recent decisions with full state info (last 10)
  const recentDecisions = await query(`
    SELECT
      s.symbol,
      tdl.state,
      tdl.action,
      tdl.was_random,
      tdl.was_executed,
      tdl.q_values,
      tdl.timestamp
    FROM trade_decisions_log tdl
    JOIN stocks s ON s.stock_id = tdl.stock_id
    ORDER BY tdl.timestamp DESC
    LIMIT 10
  `)

  return {
    modelStates: modelStates || [],
    aggStats: aggStats[0] || { total_decisions: 0, random_decisions: 0, learned_decisions: 0 },
    recentDecisions: recentDecisions || []
  }
}

function parseJson(field: any) {
  if (!field) return null
  if (typeof field === 'object') return field
  try {
    return JSON.parse(field)
  } catch {
    return null
  }
}

export default async function AgentPage() {
  const data = await getAgentData()

  const avgEpsilon = data.modelStates.length > 0
    ? data.modelStates.reduce((sum: number, s: any) => sum + parseFloat(s.exploration_rate || 0), 0) / data.modelStates.length
    : 0

  const totalQTableSize = data.modelStates.reduce((sum: number, s: any) => sum + (parseInt(s.q_table_size) || 0), 0)

  const explorationPct = data.aggStats.total_decisions > 0
    ? (data.aggStats.random_decisions / data.aggStats.total_decisions * 100)
    : 0

  // Get hyperparameters from first agent (they're the same for all)
  const hyperparams = data.modelStates[0] || {}

  return (
    <div className="space-y-6">
      {/* Hero Section */}
      <SurfaceCard className="bg-brand-gradient text-white" padding="lg">
        <h1 className="text-2xl font-semibold text-brand-glow">Q-Learning Agent</h1>
        <p className="mt-1 text-sm text-white/70">
          Model-free reinforcement learning for autonomous trading decisions
        </p>

        <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-4">
          <div className="rounded-xl bg-white/10 px-4 py-3">
            <p className="text-xs text-white/60">State Space</p>
            <p className="text-xl font-semibold">4,860</p>
            <p className="text-xs text-white/50">possible states</p>
          </div>
          <div className="rounded-xl bg-white/10 px-4 py-3">
            <p className="text-xs text-white/60">Actions</p>
            <p className="text-xl font-semibold">3</p>
            <p className="text-xs text-white/50">BUY · SELL · HOLD</p>
          </div>
          <div className="rounded-xl bg-white/10 px-4 py-3">
            <p className="text-xs text-white/60">Avg Exploration (ε)</p>
            <p className="text-xl font-semibold">{(avgEpsilon * 100).toFixed(1)}%</p>
            <p className="text-xs text-white/50">{explorationPct.toFixed(0)}% decisions random</p>
          </div>
          <div className="rounded-xl bg-white/10 px-4 py-3">
            <p className="text-xs text-white/60">Total Q-Table</p>
            <p className="text-xl font-semibold">{(totalQTableSize / 1024).toFixed(0)} KB</p>
            <p className="text-xs text-white/50">learned state-actions</p>
          </div>
        </div>
      </SurfaceCard>

      {/* Two Column Layout */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Q-Learning Algorithm */}
        <SurfaceCard>
          <h2 className="text-lg font-semibold text-slate-800 mb-4">Q-Learning Algorithm</h2>

          <div className="bg-slate-50 rounded-lg p-4 mb-4 font-mono text-sm">
            <p className="text-slate-600">Q(s,a) ← Q(s,a) + α[R + γ·max Q(s',a') - Q(s,a)]</p>
          </div>

          <div className="space-y-3 text-sm">
            <div className="flex justify-between items-center py-2 border-b border-slate-100">
              <span className="text-slate-600">Learning Rate (α)</span>
              <span className="font-mono font-semibold text-slate-800">
                {hyperparams.learning_rate || '0.1'}
              </span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-slate-100">
              <span className="text-slate-600">Discount Factor (γ)</span>
              <span className="font-mono font-semibold text-slate-800">
                {hyperparams.discount_factor || '0.95'}
              </span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-slate-100">
              <span className="text-slate-600">Exploration Decay</span>
              <span className="font-mono font-semibold text-slate-800">
                {parseFloat(hyperparams.exploration_decay || '0.99').toFixed(3)}
              </span>
            </div>
            <div className="flex justify-between items-center py-2">
              <span className="text-slate-600">Min Exploration</span>
              <span className="font-mono font-semibold text-slate-800">0.01 (1%)</span>
            </div>
          </div>

          <p className="mt-4 text-xs text-slate-500">
            The agent updates Q-values after each action, learning which state-action pairs lead to profits.
          </p>
        </SurfaceCard>

        {/* State Space */}
        <SurfaceCard>
          <h2 className="text-lg font-semibold text-slate-800 mb-4">State Space (7 Features)</h2>

          <div className="space-y-3 text-sm">
            <div className="flex justify-between items-center py-2 border-b border-slate-100">
              <span className="text-slate-600">RSI Category</span>
              <span className="text-xs text-slate-500">OVERSOLD · WEAK · NEUTRAL · STRONG · OVERBOUGHT</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-slate-100">
              <span className="text-slate-600">MA Position</span>
              <span className="text-xs text-slate-500">ABOVE · AT · BELOW</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-slate-100">
              <span className="text-slate-600">VWAP Position</span>
              <span className="text-xs text-slate-500">ABOVE · AT · BELOW</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-slate-100">
              <span className="text-slate-600">Position Status</span>
              <span className="text-xs text-slate-500">LONG · FLAT · SHORT</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-slate-100">
              <span className="text-slate-600">Price Momentum</span>
              <span className="text-xs text-slate-500">UP · FLAT · DOWN</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-slate-100">
              <span className="text-slate-600">Cash Bucket</span>
              <span className="text-xs text-slate-500">HIGH · MEDIUM · LOW</span>
            </div>
            <div className="flex justify-between items-center py-2">
              <span className="text-slate-600">Exposure Bucket</span>
              <span className="text-xs text-slate-500">NONE · LIGHT · HEAVY · OVEREXTENDED</span>
            </div>
          </div>

          <p className="mt-4 text-xs text-slate-500">
            5 × 3 × 3 × 3 × 3 × 3 × 4 = 4,860 discrete states
          </p>
        </SurfaceCard>

        {/* Reward Function */}
        <SurfaceCard>
          <h2 className="text-lg font-semibold text-slate-800 mb-4">Reward Function</h2>

          <div className="space-y-4 text-sm">
            <div className="rounded-lg bg-emerald-50 p-3">
              <p className="font-semibold text-emerald-800">BUY Action</p>
              <p className="text-emerald-700 mt-1">Base: +0.02</p>
              <p className="text-emerald-600 text-xs mt-1">
                Penalties: -0.01 if LOW cash, -0.02 if HEAVY/OVEREXTENDED
              </p>
            </div>

            <div className="rounded-lg bg-rose-50 p-3">
              <p className="font-semibold text-rose-800">SELL Action</p>
              <p className="text-rose-700 mt-1">Base: Realized P&L</p>
              <p className="text-rose-600 text-xs mt-1">
                Bonus: +0.05 quick exit (&lt;10min), +0.02 freeing capital<br/>
                Penalty: -0.02/block if holding loser &gt;30min
              </p>
            </div>

            <div className="rounded-lg bg-slate-100 p-3">
              <p className="font-semibold text-slate-800">HOLD Action</p>
              <p className="text-slate-700 mt-1">Base: -0.005 (opportunity cost)</p>
              <p className="text-slate-600 text-xs mt-1">
                Extra penalty if capital constrained
              </p>
            </div>
          </div>
        </SurfaceCard>

        {/* Action Selection */}
        <SurfaceCard>
          <h2 className="text-lg font-semibold text-slate-800 mb-4">Action Selection (ε-greedy)</h2>

          <div className="space-y-4">
            <div>
              <div className="flex justify-between text-sm mb-2">
                <span className="text-slate-600">Exploration (Random)</span>
                <span className="font-semibold text-orange-600">{explorationPct.toFixed(1)}%</span>
              </div>
              <div className="h-3 rounded-full bg-slate-200 overflow-hidden">
                <div
                  className="h-full bg-orange-500 transition-all"
                  style={{ width: `${explorationPct}%` }}
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between text-sm mb-2">
                <span className="text-slate-600">Exploitation (Learned)</span>
                <span className="font-semibold text-blue-600">{(100 - explorationPct).toFixed(1)}%</span>
              </div>
              <div className="h-3 rounded-full bg-slate-200 overflow-hidden">
                <div
                  className="h-full bg-blue-500 transition-all"
                  style={{ width: `${100 - explorationPct}%` }}
                />
              </div>
            </div>

            <p className="text-xs text-slate-500 mt-4">
              With probability ε, the agent takes a random action (exploration). Otherwise, it chooses the action with the highest Q-value (exploitation).
            </p>
          </div>
        </SurfaceCard>
      </div>

      {/* Per-Stock Agent Status */}
      <SurfaceCard>
        <h2 className="text-lg font-semibold text-slate-800 mb-4">Per-Stock Agent Status</h2>

        {data.modelStates.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {data.modelStates.map((agent: any) => {
              const epsilon = parseFloat(agent.exploration_rate || 0) * 100
              const qTableKB = (parseInt(agent.q_table_size) || 0) / 1024
              const totalReward = parseFloat(agent.total_rewards || 0)

              return (
                <div key={agent.symbol} className="rounded-xl border border-slate-200 p-4">
                  <div className="flex items-center justify-between mb-3">
                    <span className="font-semibold text-slate-800">{agent.symbol}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      epsilon < 75 ? 'bg-emerald-100 text-emerald-700' : 'bg-orange-100 text-orange-700'
                    }`}>
                      ε {epsilon.toFixed(0)}%
                    </span>
                  </div>

                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Q-Table</span>
                      <span className="font-medium text-slate-700">{qTableKB.toFixed(1)} KB</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Total Reward</span>
                      <span className={`font-medium ${totalReward >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {totalReward.toFixed(1)}
                      </span>
                    </div>
                  </div>

                  {/* Epsilon progress bar */}
                  <div className="mt-3">
                    <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                      <div
                        className={`h-full transition-all ${epsilon < 75 ? 'bg-emerald-500' : 'bg-orange-500'}`}
                        style={{ width: `${100 - epsilon}%` }}
                      />
                    </div>
                    <p className="text-[10px] text-slate-400 mt-1 text-center">
                      {(100 - epsilon).toFixed(0)}% exploitation
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <p className="text-slate-500">No agent data yet.</p>
        )}
      </SurfaceCard>

      {/* Recent Decisions */}
      <SurfaceCard>
        <h2 className="text-lg font-semibold text-slate-800 mb-4">Recent Decisions</h2>

        {data.recentDecisions.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 bg-slate-50">
                <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-3 py-2">Time</th>
                  <th className="px-3 py-2">Symbol</th>
                  <th className="px-3 py-2">Action</th>
                  <th className="px-3 py-2">Mode</th>
                  <th className="px-3 py-2">Q-Values (BUY / SELL / HOLD)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.recentDecisions.map((decision: any, idx: number) => {
                  const qValues = parseJson(decision.q_values) || {}
                  return (
                    <tr key={idx} className="hover:bg-slate-50">
                      <td className="px-3 py-2 text-xs text-slate-500">
                        {new Date(decision.timestamp).toLocaleString()}
                      </td>
                      <td className="px-3 py-2 font-medium text-slate-800">{decision.symbol}</td>
                      <td className="px-3 py-2">
                        <StatusBadge tone={
                          decision.action === 'BUY' ? 'positive' :
                          decision.action === 'SELL' ? 'negative' : 'muted'
                        }>
                          {decision.action}
                        </StatusBadge>
                      </td>
                      <td className="px-3 py-2">
                        <span className={`text-xs px-2 py-0.5 rounded ${
                          decision.was_random
                            ? 'bg-orange-100 text-orange-700'
                            : 'bg-blue-100 text-blue-700'
                        }`}>
                          {decision.was_random ? 'Explore' : 'Exploit'}
                        </span>
                      </td>
                      <td className="px-3 py-2 font-mono text-xs text-slate-600">
                        {qValues.BUY?.toFixed(3) || '0.000'} / {qValues.SELL?.toFixed(3) || '0.000'} / {qValues.HOLD?.toFixed(3) || '0.000'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-slate-500">No decisions yet.</p>
        )}
      </SurfaceCard>
    </div>
  )
}
