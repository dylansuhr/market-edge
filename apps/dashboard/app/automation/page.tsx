"use client"

import type { ComponentProps } from 'react'
import { useEffect, useState } from 'react'
import { SurfaceCard } from '@/components/ui/SurfaceCard'
import { StatusBadge } from '@/components/ui/StatusBadge'

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

const WORKFLOWS = ['market-data-etl.yml', 'trading-agent.yml', 'settlement.yml']

type StatusTone = NonNullable<ComponentProps<typeof StatusBadge>['tone']>

const workflowLabels: Record<string, string> = {
  'market-data-etl.yml': 'Market Data ETL',
  'trading-agent.yml': 'Trading Agent',
  'settlement.yml': 'Daily Settlement'
}

function formatDate(date: string | null | undefined) {
  if (!date) return 'N/A'
  return new Date(date).toLocaleString()
}

function statusTone(status?: string | null, conclusion?: string | null): StatusTone {
  if (status === 'in_progress') {
    return 'warning'
  }
  if (conclusion === 'success') {
    return 'positive'
  }
  if (conclusion === 'failure') {
    return 'negative'
  }
  if (conclusion === 'cancelled') {
    return 'muted'
  }
  return 'info'
}

function statusLabel(status?: string | null, conclusion?: string | null) {
  if (status === 'in_progress') {
    return 'In Progress'
  }
  if (conclusion) {
    return conclusion.toUpperCase()
  }
  return status?.toUpperCase() || 'UNKNOWN'
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
          setError(data?.error || null)
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
    <div className="min-h-screen bg-brand-background p-6 md:p-10">
      <div className="mx-auto flex max-w-5xl flex-col gap-8">
        <SurfaceCard
          padding="lg"
          className="flex flex-col gap-4 bg-brand-gradient text-white md:flex-row md:items-center md:justify-between"
        >
          <div>
            <h1 className="text-3xl font-semibold text-brand-glow">Automation Timeline</h1>
            <p className="mt-2 text-sm text-white/80">
              GitHub Actions activity for ETL, trading, and settlement workflows.
            </p>
          </div>
          <button
            onClick={() => setTimestamp(Date.now())}
            className="rounded-full bg-white px-5 py-2 text-sm font-semibold text-brand shadow transition hover:bg-brand-muted hover:text-brand"
          >
            Refresh
          </button>
        </SurfaceCard>

        {error && (
          <SurfaceCard className="border border-amber-200 bg-amber-50 text-amber-700">
            <p className="text-sm">{error}</p>
          </SurfaceCard>
        )}

        {loading && runs.length === 0 ? (
          <SurfaceCard className="text-center text-slate-500">
            Loading automation timeline...
          </SurfaceCard>
        ) : (
          <div className="space-y-6">
            {WORKFLOWS.map(workflow => {
              const history = groupedRuns[workflow] || []
              return (
                <SurfaceCard key={workflow} className="overflow-hidden">
                  <div className="flex items-start justify-between gap-4 border-b border-brand-muted/60 bg-brand-muted/30 px-6 py-4">
                    <div>
                      <h2 className="text-xl font-semibold text-slate-800">
                        {workflowLabels[workflow] || workflow}
                      </h2>
                      <p className="text-sm text-slate-500">Workflow file: {workflow}</p>
                    </div>
                    {history.length > 0 && (
                      <div className="text-xs uppercase tracking-wide text-slate-500">
                        Last run: {formatDate(history[0].updated_at || history[0].created_at)}
                      </div>
                    )}
                  </div>

                  {history.length > 0 ? (
                    <ul className="divide-y divide-brand-muted">
                      {history.map(run => (
                        <li key={run.run_id} className="flex flex-wrap items-start gap-6 px-6 py-5 text-sm text-slate-600">
                          <div>
                            <div className="text-xs uppercase tracking-wide text-slate-400">Run ID</div>
                            <a
                              href={run.html_url}
                              target="_blank"
                              rel="noreferrer"
                              className="font-semibold text-brand hover:text-brand-light"
                            >
                              #{run.run_id}
                            </a>
                          </div>
                          <div>
                            <div className="text-xs uppercase tracking-wide text-slate-400">Actor</div>
                            <div className="flex items-center gap-2 text-sm">
                              {run.actor?.avatar_url ? (
                                <img
                                  src={run.actor.avatar_url}
                                  alt={run.actor.login}
                                  className="h-6 w-6 rounded-full"
                                />
                              ) : (
                                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-muted text-xs font-semibold text-brand">
                                  {run.actor?.login?.[0]?.toUpperCase() || 'S'}
                                </div>
                              )}
                              <span>{run.actor?.login || 'system'}</span>
                            </div>
                          </div>
                          <div>
                            <div className="text-xs uppercase tracking-wide text-slate-400">Status</div>
                            <StatusBadge tone={statusTone(run.status, run.conclusion)} className="mt-1">
                              {statusLabel(run.status, run.conclusion)}
                            </StatusBadge>
                          </div>
                          <div className="min-w-[180px] flex-1">
                            <div className="text-xs uppercase tracking-wide text-slate-400">Started</div>
                            <div>{formatDate(run.created_at)}</div>
                          </div>
                          <div className="min-w-[180px] flex-1">
                            <div className="text-xs uppercase tracking-wide text-slate-400">
                              {run.status === 'in_progress' ? 'Estimated Completion' : 'Finished'}
                            </div>
                            <div>
                              {run.status === 'in_progress'
                                ? 'In progress…'
                                : formatDate(run.updated_at || run.created_at)}
                            </div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="px-6 py-8 text-slate-500">No runs for this workflow yet.</div>
                  )}
                </SurfaceCard>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
