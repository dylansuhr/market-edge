/**
 * Agent Stats Page
 *
 * Q-Learning agent metrics and decision logs
 */

import { query } from '@/lib/db'

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
    decisionLogs: decisionLogs || []
  }
}

export default async function AgentPage() {
  const data = await getAgentData()

  return (
    <div>
      <h1 className="text-3xl font-bold mb-8">Q-Learning Agent Stats</h1>

      {/* Model States by Stock */}
      <div className="bg-white shadow rounded-lg p-6 mb-8">
        <h2 className="text-xl font-bold mb-4">Agent Learning Progress</h2>
        {data.modelStates.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left border-b">
                  <th className="pb-2">Symbol</th>
                  <th className="pb-2">Model Type</th>
                  <th className="pb-2">Episodes</th>
                  <th className="pb-2">Exploration Rate (ε)</th>
                  <th className="pb-2">Avg Reward</th>
                  <th className="pb-2">Last Updated</th>
                </tr>
              </thead>
              <tbody>
                {data.modelStates.map((state: any) => (
                  <tr key={state.symbol} className="border-b hover:bg-gray-50">
                    <td className="py-3 font-semibold">{state.symbol}</td>
                    <td className="py-3">{state.model_type}</td>
                    <td className="py-3">{state.total_episodes}</td>
                    <td className="py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-24 bg-gray-200 rounded-full h-2">
                          <div
                            className="bg-blue-600 h-2 rounded-full"
                            style={{ width: `${parseFloat(state.exploration_rate) * 100}%` }}
                          ></div>
                        </div>
                        <span className="text-sm">{(parseFloat(state.exploration_rate) * 100).toFixed(1)}%</span>
                      </div>
                    </td>
                    <td className={`py-3 ${parseFloat(state.avg_reward || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {state.avg_reward ? parseFloat(state.avg_reward).toFixed(2) : 'N/A'}
                    </td>
                    <td className="py-3 text-sm">{new Date(state.updated_at).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-gray-500">No agent data yet. Agents are created on first trade.</p>
        )}
      </div>

      {/* Recent Decision Logs */}
      <div className="bg-white shadow rounded-lg p-6">
        <h2 className="text-xl font-bold mb-4">Recent Decisions (Last 50)</h2>
        {data.decisionLogs.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left border-b">
                  <th className="pb-2">Time</th>
                  <th className="pb-2">Symbol</th>
                  <th className="pb-2">State</th>
                  <th className="pb-2">Action</th>
                  <th className="pb-2">Random?</th>
                  <th className="pb-2">Q-Values</th>
                </tr>
              </thead>
              <tbody>
                {data.decisionLogs.map((log: any, idx: number) => (
                  <tr key={idx} className="border-b hover:bg-gray-50">
                    <td className="py-3 text-sm">{new Date(log.timestamp).toLocaleString()}</td>
                    <td className="py-3 font-semibold">{log.symbol}</td>
                    <td className="py-3 text-sm font-mono">{log.state}</td>
                    <td className={`py-3 font-semibold ${log.action === 'BUY' ? 'text-green-600' : log.action === 'SELL' ? 'text-red-600' : 'text-gray-600'}`}>
                      {log.action}
                    </td>
                    <td className="py-3">
                      {log.was_random ? (
                        <span className="text-orange-600 text-sm">EXPLORE</span>
                      ) : (
                        <span className="text-blue-600 text-sm">EXPLOIT</span>
                      )}
                    </td>
                    <td className="py-3 text-xs font-mono">
                      {log.q_values ? JSON.stringify(log.q_values).substring(0, 50) + '...' : 'N/A'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-gray-500">No decision logs yet. Decisions are logged when trading agent runs.</p>
        )}
      </div>

      {/* Learning Explanation */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mt-8">
        <h3 className="font-bold mb-2">How Q-Learning Works</h3>
        <ul className="text-sm space-y-2 text-gray-700">
          <li><strong>Exploration Rate (ε):</strong> Probability of taking random action. Starts at 100%, decays to 1%.</li>
          <li><strong>Episodes:</strong> Number of trading sessions completed. More episodes = more learning.</li>
          <li><strong>EXPLORE:</strong> Random action to discover new strategies.</li>
          <li><strong>EXPLOIT:</strong> Use best known action based on Q-values.</li>
          <li><strong>Q-Values:</strong> Expected reward for each action in a given state. Higher = better.</li>
        </ul>
      </div>
    </div>
  )
}
