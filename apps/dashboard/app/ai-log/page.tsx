'use client'

import { useEffect, useState } from 'react'

interface Decision {
  decision_id: number
  symbol: string
  name: string
  timestamp: string
  state: {
    rsi: number
    price: number
    sma: number
    vwap: number
    position_qty: number
  }
  action: 'BUY' | 'SELL' | 'HOLD'
  was_executed: boolean
  was_random: boolean
  reasoning: string
  q_values: Record<string, number> | null
}

export default function AILogPage() {
  const [decisions, setDecisions] = useState<Decision[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'executed' | 'exploration'>('all')

  useEffect(() => {
    fetchDecisions()
  }, [])

  async function fetchDecisions() {
    try {
      const res = await fetch('/api/ai-log?limit=100')
      const data = await res.json()
      setDecisions(data.decisions || [])
    } catch (error) {
      console.error('Failed to fetch AI logs:', error)
    } finally {
      setLoading(false)
    }
  }

  const filteredDecisions = decisions.filter(d => {
    if (filter === 'executed') return d.was_executed
    if (filter === 'exploration') return d.was_random
    return true
  })

  function getActionColor(action: string, wasExecuted: boolean) {
    if (!wasExecuted) return 'text-gray-400'
    if (action === 'BUY') return 'text-green-600 font-bold'
    if (action === 'SELL') return 'text-red-600 font-bold'
    return 'text-gray-600'
  }

  function getActionBadge(decision: Decision) {
    const baseClasses = 'px-2 py-1 rounded text-xs font-medium'

    if (decision.was_random) {
      return <span className={`${baseClasses} bg-purple-100 text-purple-700`}>EXPLORE</span>
    }

    if (decision.was_executed) {
      if (decision.action === 'BUY') {
        return <span className={`${baseClasses} bg-green-100 text-green-700`}>✓ BUY</span>
      }
      if (decision.action === 'SELL') {
        return <span className={`${baseClasses} bg-red-100 text-red-700`}>✓ SELL</span>
      }
    }

    return <span className={`${baseClasses} bg-gray-100 text-gray-600`}>{decision.action}</span>
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">AI Decision Log</h1>
            <p className="text-gray-600 mt-1">Complete transparency into every decision the RL agent makes</p>
          </div>

          <button
            onClick={fetchDecisions}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Refresh
          </button>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-lg shadow p-4 mb-6">
          <div className="flex gap-2">
            <button
              onClick={() => setFilter('all')}
              className={`px-4 py-2 rounded ${filter === 'all' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700'}`}
            >
              All Decisions ({decisions.length})
            </button>
            <button
              onClick={() => setFilter('executed')}
              className={`px-4 py-2 rounded ${filter === 'executed' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700'}`}
            >
              Executed Only ({decisions.filter(d => d.was_executed).length})
            </button>
            <button
              onClick={() => setFilter('exploration')}
              className={`px-4 py-2 rounded ${filter === 'exploration' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700'}`}
            >
              Exploration ({decisions.filter(d => d.was_random).length})
            </button>
          </div>
        </div>

        {/* Decision Log Table */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-gray-600">Loading AI decisions...</div>
          ) : filteredDecisions.length === 0 ? (
            <div className="p-8 text-center text-gray-600">
              No AI decisions logged yet. The agent will start logging decisions on its next run.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Time</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Symbol</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Decision</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">State</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Reasoning</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Q-Values</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {filteredDecisions.map((decision) => (
                    <tr key={decision.decision_id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {new Date(decision.timestamp).toLocaleString()}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-semibold text-gray-900">{decision.symbol}</div>
                        <div className="text-xs text-gray-500">{decision.name}</div>
                      </td>
                      <td className="px-4 py-3">
                        {getActionBadge(decision)}
                      </td>
                      <td className="px-4 py-3 text-xs">
                        <div className="space-y-1">
                          <div>RSI: <span className="font-semibold">{decision.state.rsi.toFixed(1)}</span></div>
                          <div>Price: <span className="font-semibold">${decision.state.price.toFixed(2)}</span></div>
                          <div>Position: <span className="font-semibold">{decision.state.position_qty}</span></div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700 max-w-md">
                        {decision.reasoning}
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {decision.q_values ? (
                          <div className="space-y-1 font-mono">
                            {Object.entries(decision.q_values).map(([action, value]) => (
                              <div key={action} className={action === decision.action ? 'font-bold text-blue-600' : ''}>
                                {action}: {typeof value === 'number' ? value.toFixed(3) : value}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <span className="text-gray-400">N/A</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Stats Summary */}
        <div className="mt-6 grid grid-cols-4 gap-4">
          <div className="bg-white rounded-lg shadow p-4">
            <div className="text-sm text-gray-600">Total Decisions</div>
            <div className="text-2xl font-bold text-gray-900">{decisions.length}</div>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <div className="text-sm text-gray-600">Executed</div>
            <div className="text-2xl font-bold text-green-600">
              {decisions.filter(d => d.was_executed).length}
            </div>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <div className="text-sm text-gray-600">Exploration</div>
            <div className="text-2xl font-bold text-purple-600">
              {decisions.filter(d => d.was_random).length}
            </div>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <div className="text-sm text-gray-600">Exploitation</div>
            <div className="text-2xl font-bold text-blue-600">
              {decisions.filter(d => !d.was_random).length}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
