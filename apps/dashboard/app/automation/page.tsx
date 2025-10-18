"use client"

import { useEffect, useState } from 'react'

interface AutomationRun {
  workflow_name: string
  workflow_file: string
  run_id: number
  event: string
  status: string | null
  conclusion: string | null
  created_at: string
  updated_at: string | null
  html_url: string
  actor: {
    login: string
    avatar_url: string
  } | null
}

const WORKFLOWS = ['market-data-etl.yml', 'trading-agent.yml', 'trade-settlement.yml']

function statusClasses(status?: string | null, conclusion?: string | null) {
  if (status === 'in_progress') {
    return 'bg-yellow-100 text-yellow-700'
  }
  if (conclusion === 'success') {
    return 'bg-green-100 text-green-700'
  }
  if (conclusion === 'failure') {
    return 'bg-red-100 text-red-700'
  }
  if (conclusion === 'cancelled') {
    return 'bg-gray-100 text-gray-600'
  }
  return 'bg-gray-100 text-gray-600'
}

function formatDate(date: string | null | undefined) {
  if (!date) return 'N/A'
  return new Date(date).toLocaleString()
}

const workflowLabels: Record<string, string> = {
  'market-data-etl.yml': 'Market Data ETL',
  'trading-agent.yml': 'Trading Agent',
  'trade-settlement.yml': 'Trade Settlement'
}

function groupRuns(runs: AutomationRun[]) {
  const grouped: Record<string, AutomationRun[]> = {}
  runs.forEach(run => {
    const key = run.workflow_file
    if (!grouped[key]) {
      grouped[key] = []
    }
    grouped[key].push(run)
  })
  return grouped
}

export default function AutomationPage() {
  const [runs, setRuns] = useState<AutomationRun[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [timestamp, setTimestamp] = useState<number>(Date.now())

  useEffect(() => {
    let cancelled = false

    async function loadRuns() {
      setLoading(true)
      setError(null)

      try {
        const res = await fetch('/api/automation?workflow=all&limit=50', { cache: 'no-store' })
        const data = await res.json()

        if (!res.ok) {
          throw new Error(data?.error || 'Failed to fetch automation runs')
        }

        if (!cancelled) {
          setRuns(Array.isArray(data.runs) ? data.runs : [])
        }

        if (data?.error && !cancelled) {
          setError(data.error)
        }
      } catch (err: any) {
        if (!cancelled) {
          setError(err?.message || 'Failed to fetch automation runs')
          setRuns([])
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    loadRuns()

    const interval = setInterval(() => {
      setTimestamp(Date.now())
    }, 5 * 60 * 1000)

    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [timestamp])

  const groupedRuns = groupRuns(runs)

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-5xl mx-auto space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Automation Timeline</h1>
            <p className="text-gray-600 mt-1">
              Recent GitHub Actions runs for ETL, trading, and settlement.
            </p>
          </div>
          <button
            onClick={() => setTimestamp(Date.now())}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Refresh
          </button>
        </div>

        {error && (
          <div className="bg-red-100 text-red-700 border border-red-200 rounded p-4">
            Failed to load automation history. Ensure GitHub credentials are configured.
          </div>
        )}

        {loading && runs.length === 0 ? (
          <div className="bg-white shadow rounded-lg p-6 text-center text-gray-500">
            Loading automation timeline...
          </div>
        ) : (
          <div className="space-y-8">
            {WORKFLOWS.map(workflow => {
              const history = groupedRuns[workflow] || []
              return (
                <div key={workflow} className="bg-white shadow rounded-lg overflow-hidden">
                  <div className="border-b px-6 py-4 flex items-center justify-between bg-gray-50">
                    <div>
                      <h2 className="text-xl font-semibold text-gray-900">
                        {workflowLabels[workflow] || workflow}
                      </h2>
                      <p className="text-sm text-gray-500">Workflow file: {workflow}</p>
                    </div>
                    {history.length > 0 && (
                      <div className="text-sm text-gray-500">
                        Last run: {formatDate(history[0].updated_at || history[0].created_at)}
                      </div>
                    )}
                  </div>

                  {history.length > 0 ? (
                    <ul className="divide-y divide-gray-200">
                      {history.map(run => (
                        <li key={run.run_id} className="px-6 py-4 flex flex-wrap gap-4 items-start">
                          <div>
                            <div className="text-sm text-gray-500">Run ID</div>
                            <a
                              href={run.html_url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-blue-600 hover:underline text-sm"
                            >
                              #{run.run_id}
                            </a>
                          </div>
                          <div>
                            <div className="text-sm text-gray-500">Actor</div>
                            <div className="flex items-center gap-2">
                              {run.actor?.avatar_url && (
                                <img
                                  src={run.actor.avatar_url}
                                  alt={run.actor.login}
                                  className="w-6 h-6 rounded-full"
                                />
                              )}
                              <span className="text-sm text-gray-700">{run.actor?.login || 'system'}</span>
                            </div>
                          </div>
                          <div>
                            <div className="text-sm text-gray-500">Status</div>
                            <span className={`px-2 py-1 rounded text-xs font-medium ${statusClasses(run.status, run.conclusion)}`}>
                              {run.status === 'in_progress'
                                ? 'In Progress'
                                : run.conclusion
                                ? run.conclusion.toUpperCase()
                                : run.status || 'UNKNOWN'}
                            </span>
                          </div>
                          <div className="flex-1 min-w-[180px]">
                            <div className="text-sm text-gray-500">Started</div>
                            <div className="text-sm text-gray-700">{formatDate(run.created_at)}</div>
                          </div>
                          <div className="flex-1 min-w-[180px]">
                            <div className="text-sm text-gray-500">
                              {run.status === 'in_progress' ? 'Estimated Completion' : 'Finished'}
                            </div>
                            <div className="text-sm text-gray-700">
                              {run.status === 'in_progress'
                                ? 'In progress…'
                                : formatDate(run.updated_at || run.created_at)}
                            </div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="px-6 py-8 text-gray-500">No runs for this workflow yet.</div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
