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
      const res = await fetch('/api/ai-log?limit=500')  // Increased to show 2 days of activity
      const data = await res.json()

      // Ensure each decision has a properly parsed state object
      const validDecisions = (data.decisions || []).map((d: any) => ({
        ...d,
        state: typeof d.state === 'object' ? d.state : JSON.parse(d.state || '{}'),
        q_values: typeof d.q_values === 'object' ? d.q_values : (d.q_values ? JSON.parse(d.q_values) : null)
      }))

      setDecisions(validDecisions)
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
                          <div>RSI: <span className="font-semibold">{decision.state?.rsi?.toFixed(1) ?? 'N/A'}</span></div>
                          <div>Price: <span className="font-semibold">${decision.state?.price?.toFixed(2) ?? 'N/A'}</span></div>
                          <div>Position: <span className="font-semibold">{decision.state?.position_qty ?? 0}</span></div>
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
        <div className="mt-6 grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
          <div className="bg-white rounded-lg shadow p-4">
            <div className="text-sm text-gray-600">Total Decisions</div>
            <div className="text-2xl font-bold text-gray-900">{decisions.length}</div>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <div className="text-sm text-gray-600">HOLD</div>
            <div className="text-2xl font-bold text-gray-600">
              {decisions.filter(d => d.action === 'HOLD').length}
            </div>
            <div className="text-xs text-gray-500 mt-1">
              {decisions.length > 0 ? ((decisions.filter(d => d.action === 'HOLD').length / decisions.length) * 100).toFixed(1) : 0}%
            </div>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <div className="text-sm text-gray-600">BUY</div>
            <div className="text-2xl font-bold text-green-600">
              {decisions.filter(d => d.action === 'BUY').length}
            </div>
            <div className="text-xs text-gray-500 mt-1">
              {decisions.filter(d => d.action === 'BUY' && d.was_executed).length} executed
            </div>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <div className="text-sm text-gray-600">SELL</div>
            <div className="text-2xl font-bold text-red-600">
              {decisions.filter(d => d.action === 'SELL').length}
            </div>
            <div className="text-xs text-gray-500 mt-1">
              {decisions.filter(d => d.action === 'SELL' && d.was_executed).length} executed
            </div>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <div className="text-sm text-gray-600">Exploration</div>
            <div className="text-2xl font-bold text-purple-600">
              {decisions.filter(d => d.was_random).length}
            </div>
            <div className="text-xs text-gray-500 mt-1">
              {decisions.length > 0 ? ((decisions.filter(d => d.was_random).length / decisions.length) * 100).toFixed(1) : 0}%
            </div>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <div className="text-sm text-gray-600">Exploitation</div>
            <div className="text-2xl font-bold text-blue-600">
              {decisions.filter(d => !d.was_random).length}
            </div>
            <div className="text-xs text-gray-500 mt-1">
              {decisions.length > 0 ? ((decisions.filter(d => !d.was_random).length / decisions.length) * 100).toFixed(1) : 0}%
            </div>
          </div>
        </div>

        {/* Time-based Activity Analysis */}
        <div className="mt-6 bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Recent Activity Summary</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="border rounded-lg p-4">
              <div className="text-sm text-gray-600 mb-2">Last 24 Hours</div>
              <div className="space-y-1 text-sm">
                <div>Total: <span className="font-bold">{decisions.filter(d => new Date(d.timestamp) > new Date(Date.now() - 24*60*60*1000)).length}</span></div>
                <div>HOLD: <span className="font-bold text-gray-600">{decisions.filter(d => new Date(d.timestamp) > new Date(Date.now() - 24*60*60*1000) && d.action === 'HOLD').length}</span></div>
                <div>BUY: <span className="font-bold text-green-600">{decisions.filter(d => new Date(d.timestamp) > new Date(Date.now() - 24*60*60*1000) && d.action === 'BUY').length}</span></div>
                <div>SELL: <span className="font-bold text-red-600">{decisions.filter(d => new Date(d.timestamp) > new Date(Date.now() - 24*60*60*1000) && d.action === 'SELL').length}</span></div>
              </div>
            </div>
            <div className="border rounded-lg p-4">
              <div className="text-sm text-gray-600 mb-2">Last 48 Hours</div>
              <div className="space-y-1 text-sm">
                <div>Total: <span className="font-bold">{decisions.filter(d => new Date(d.timestamp) > new Date(Date.now() - 48*60*60*1000)).length}</span></div>
                <div>HOLD: <span className="font-bold text-gray-600">{decisions.filter(d => new Date(d.timestamp) > new Date(Date.now() - 48*60*60*1000) && d.action === 'HOLD').length}</span></div>
                <div>BUY: <span className="font-bold text-green-600">{decisions.filter(d => new Date(d.timestamp) > new Date(Date.now() - 48*60*60*1000) && d.action === 'BUY').length}</span></div>
                <div>SELL: <span className="font-bold text-red-600">{decisions.filter(d => new Date(d.timestamp) > new Date(Date.now() - 48*60*60*1000) && d.action === 'SELL').length}</span></div>
              </div>
            </div>
            <div className="border rounded-lg p-4">
              <div className="text-sm text-gray-600 mb-2">Last Hour</div>
              <div className="space-y-1 text-sm">
                <div>Total: <span className="font-bold">{decisions.filter(d => new Date(d.timestamp) > new Date(Date.now() - 60*60*1000)).length}</span></div>
                <div>HOLD: <span className="font-bold text-gray-600">{decisions.filter(d => new Date(d.timestamp) > new Date(Date.now() - 60*60*1000) && d.action === 'HOLD').length}</span></div>
                <div>BUY: <span className="font-bold text-green-600">{decisions.filter(d => new Date(d.timestamp) > new Date(Date.now() - 60*60*1000) && d.action === 'BUY').length}</span></div>
                <div>SELL: <span className="font-bold text-red-600">{decisions.filter(d => new Date(d.timestamp) > new Date(Date.now() - 60*60*1000) && d.action === 'SELL').length}</span></div>
              </div>
            </div>
          </div>
        </div>

        {/* Action Breakdown by Symbol */}
        <div className="mt-6 bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Action Breakdown by Symbol (Last 500)</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            {(() => {
              const symbolStats = decisions.reduce((acc, d) => {
                if (!acc[d.symbol]) {
                  acc[d.symbol] = { total: 0, hold: 0, buy: 0, sell: 0 }
                }
                acc[d.symbol].total++
                if (d.action === 'HOLD') acc[d.symbol].hold++
                if (d.action === 'BUY') acc[d.symbol].buy++
                if (d.action === 'SELL') acc[d.symbol].sell++
                return acc
              }, {} as Record<string, { total: number; hold: number; buy: number; sell: number }>)

              return Object.entries(symbolStats)
                .sort((a, b) => b[1].total - a[1].total)
                .map(([symbol, stats]) => (
                  <div key={symbol} className="border rounded-lg p-3">
                    <div className="font-bold text-gray-900 mb-2">{symbol}</div>
                    <div className="text-xs space-y-1">
                      <div className="flex justify-between">
                        <span className="text-gray-600">HOLD:</span>
                        <span className="font-semibold">{stats.hold} ({((stats.hold / stats.total) * 100).toFixed(0)}%)</span>
                      </div>
                      <div className="flex justify-between text-green-600">
                        <span>BUY:</span>
                        <span className="font-semibold">{stats.buy}</span>
                      </div>
                      <div className="flex justify-between text-red-600">
                        <span>SELL:</span>
                        <span className="font-semibold">{stats.sell}</span>
                      </div>
                    </div>
                  </div>
                ))
            })()}
          </div>
        </div>
      </div>
    </div>
  )
}
