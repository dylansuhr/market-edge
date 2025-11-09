/**
 * Agent Stats Page
 *
 * Q-Learning agent metrics and decision logs
 */

import { query } from '@/lib/db'
import { tooltips } from '@/lib/tooltips'
import { InfoTooltip } from '@/components/ui/InfoTooltip'
import { SurfaceCard } from '@/components/ui/SurfaceCard'
import { StatusBadge } from '@/components/ui/StatusBadge'

function parseJson(field: any) {
  if (!field) return null
  if (typeof field === 'object') return field
  try {
    return JSON.parse(field)
  } catch {
    return null
  }
}

function renderState(rawState: any) {
  const state = parseJson(rawState)
  if (!state) {
    return <span className="text-slate-400 text-xs">N/A</span>
  }

  return (
    <div className="space-y-1 text-xs text-slate-600">
      {'rsi' in state && (
        <div>
          RSI: <span className="font-semibold text-slate-800">{Number(state.rsi).toFixed(1)}</span>
        </div>
      )}
      {'price' in state && (
        <div>
          Price: <span className="font-semibold text-slate-800">${Number(state.price).toFixed(2)}</span>
        </div>
      )}
      {'position_qty' in state && (
        <div>
          Position: <span className="font-semibold text-slate-800">{state.position_qty}</span>
        </div>
      )}
    </div>
  )
}

export const dynamic = 'force-dynamic'

async function getAgentData() {
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

  return {
    modelStates: modelStates || [],
    decisionLogs: (decisionLogs || []).map((log: any) => ({
      ...log,
      state: parseJson(log.state),
      q_values: parseJson(log.q_values)
    }))
  }
}

export default async function AgentPage() {
  const data = await getAgentData()

  return (
    <div className="min-h-screen bg-brand-background p-6 md:p-10">
      <div className="mx-auto flex max-w-6xl flex-col gap-8">
        <SurfaceCard
          padding="lg"
          className="bg-brand-gradient text-white"
        >
          <h1 className="text-3xl font-semibold text-brand-glow">Q-Learning Agent Stats</h1>
          <p className="mt-2 text-sm text-white/80">
            Inspect the model state snapshots, exploration cadence, and raw decision signals.
          </p>
        </SurfaceCard>

        <SurfaceCard className="overflow-hidden">
          <h2 className="mb-4 text-xl font-semibold text-slate-800">Agent Learning Progress</h2>
          {data.modelStates.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="border-b border-brand-muted bg-brand-muted/40">
                  <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="px-4 py-3">Symbol</th>
                    <th className="px-4 py-3">Model Type</th>
                    <th className="px-4 py-3 flex items-center">
                      Episodes
                      <InfoTooltip content={tooltips.episodes} position="right" />
                    </th>
                    <th className="px-4 py-3 flex items-center">
                      Exploration (ε)
                      <InfoTooltip content={tooltips.explorationRate} position="right" />
                    </th>
                    <th className="px-4 py-3">Avg Reward</th>
                    <th className="px-4 py-3">Last Updated</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-brand-muted text-sm text-slate-600">
                  {data.modelStates.map((state: any) => {
                    const exploration = Number.parseFloat(String(state.exploration_rate ?? 0)) * 100
                    const avgReward = state.avg_reward ? Number.parseFloat(String(state.avg_reward)) : null
                    return (
                      <tr key={state.symbol} className="odd:bg-brand-muted/30 transition-colors hover:bg-brand-muted/40">
                        <td className="px-4 py-3 font-semibold text-slate-800">{state.symbol}</td>
                        <td className="px-4 py-3">{state.model_type}</td>
                        <td className="px-4 py-3">{state.total_episodes}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="h-2 w-24 rounded-full bg-brand-muted">
                              <div
                                className="h-full rounded-full bg-white"
                                style={{ width: `${Math.min(Math.max(exploration, 0), 100)}%` }}
                              />
                            </div>
                            <span className="text-xs font-semibold text-slate-500">{exploration.toFixed(1)}%</span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          {avgReward !== null ? (
                            <StatusBadge tone={avgReward >= 0 ? 'positive' : 'negative'}>
                              {avgReward.toFixed(2)}
                            </StatusBadge>
                          ) : (
                            <span className="text-slate-400">N/A</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs">
                          {new Date(state.updated_at).toLocaleString()}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-slate-500">No agent data yet. Agents are created on the first trade for each symbol.</p>
          )}
        </SurfaceCard>

        <SurfaceCard className="overflow-hidden">
          <h2 className="mb-4 text-xl font-semibold text-slate-800">Recent Decisions (Last 50)</h2>
          {data.decisionLogs.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="border-b border-brand-muted bg-brand-muted/40">
                  <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="px-4 py-3">Time</th>
                    <th className="px-4 py-3">Symbol</th>
                    <th className="px-4 py-3">State</th>
                    <th className="px-4 py-3">Action</th>
                    <th className="px-4 py-3">Mode</th>
                    <th className="px-4 py-3">Q-Values</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-brand-muted text-sm text-slate-600">
                  {data.decisionLogs.map((log: any, idx: number) => (
                    <tr key={idx} className="odd:bg-brand-muted/30 transition-colors hover:bg-brand-muted/40">
                      <td className="px-4 py-3 text-xs">{new Date(log.timestamp).toLocaleString()}</td>
                      <td className="px-4 py-3 font-semibold text-slate-800">{log.symbol}</td>
                      <td className="px-4 py-3 text-xs">{renderState(log.state)}</td>
                      <td className="px-4 py-3">
                        <StatusBadge tone={log.action === 'BUY' ? 'positive' : log.action === 'SELL' ? 'negative' : 'muted'}>
                          {log.action}
                        </StatusBadge>
                      </td>
                      <td className="px-4 py-3">
                        {log.was_random ? (
                          <StatusBadge tone="warning">Explore</StatusBadge>
                        ) : (
                          <StatusBadge tone="info">Exploit</StatusBadge>
                        )}
                      </td>
                      <td className="px-4 py-3 text-[11px] font-mono">
                        {log.q_values ? (
                          <div className="space-y-1">
                            {(Object.entries(log.q_values) as Array<[string, number | string]>).map(([action, value]) => (
                              <div
                                key={action}
                                className={action === log.action ? 'font-semibold text-brand' : 'text-slate-500'}
                              >
                                {action}: {typeof value === 'number' ? value.toFixed(3) : value}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <span className="text-slate-400">N/A</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-slate-500">
              No decision logs yet. Decisions appear once the trading agent begins executing.
            </p>
          )}
        </SurfaceCard>

        <SurfaceCard className="border border-brand-muted/80 bg-brand-muted/40">
          <h3 className="text-lg font-semibold text-slate-800">How Q-Learning Works</h3>
          <ul className="mt-3 space-y-2 text-sm text-slate-600">
            <li><strong>Exploration Rate (ε):</strong> Starts high so the agent samples new actions, decays toward 1%.</li>
            <li><strong>Episodes:</strong> Each simulated trading session. More episodes reinforce stable policies.</li>
            <li><strong>EXPLORE:</strong> Random action to discover new edge cases.</li>
            <li><strong>EXPLOIT:</strong> Choose the action with the highest learned Q-value.</li>
            <li><strong>Q-Values:</strong> Expected future reward for each action in the current state.</li>
          </ul>
        </SurfaceCard>
      </div>
    </div>
  )
}
