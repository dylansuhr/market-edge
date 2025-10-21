"use client"

import { useEffect, useMemo, useState } from 'react'
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
}

type PipelineSummary = {
  workflow: string
  label: string
  lastRun: AutomationRun | null
  status: string
  tone: 'positive' | 'warning' | 'negative' | 'info' | 'muted'
  message: string
}

const WORKFLOWS = ['market-data-etl.yml', 'trading-agent.yml', 'settlement.yml'] as const

const WORKFLOW_LABELS: Record<string, string> = {
  'market-data-etl.yml': 'Market Data ETL',
  'trading-agent.yml': 'Trading Agent',
  'settlement.yml': 'Daily Settlement',
}

function deriveTone(run?: AutomationRun | null) {
  if (!run) return 'muted'
  if (run.status === 'in_progress') return 'warning'
  if (run.conclusion === 'success') return 'positive'
  if (run.conclusion === 'failure') return 'negative'
  if (run.conclusion === 'cancelled') return 'muted'
  return 'info'
}

function statusLabel(run?: AutomationRun | null) {
  if (!run) return 'No recent runs'
  if (run.status === 'in_progress') return 'In Progress'
  if (run.conclusion) return run.conclusion.toUpperCase()
  return run.status?.toUpperCase() || 'UNKNOWN'
}

function formatDate(date: string | null | undefined) {
  if (!date) return 'N/A'
  return new Date(date).toLocaleString()
}

export default function CapitalPipelineStatus() {
  const [runs, setRuns] = useState<AutomationRun[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function loadRuns() {
      setLoading(true)
      setError(null)

      try {
        const res = await fetch('/api/automation?workflow=all&limit=15', { cache: 'no-store' })
        const data = await res.json()

        if (!res.ok) {
          throw new Error(data?.error || 'Failed to fetch automation runs')
        }

        if (!cancelled) {
          setRuns(Array.isArray(data.runs) ? data.runs : [])
        }
      } catch (err: any) {
        if (!cancelled) {
          setRuns([])
          setError(err?.message || 'Failed to fetch automation runs')
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    loadRuns()

    const interval = setInterval(loadRuns, 5 * 60 * 1000)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [])

  const summaries: PipelineSummary[] = useMemo(() => {
    return WORKFLOWS.map((workflow) => {
      const latestRun = runs.find((run) => run.workflow_file === workflow) || null
      const tone = deriveTone(latestRun)
      const status = statusLabel(latestRun)

      return {
        workflow,
        label: WORKFLOW_LABELS[workflow] || workflow,
        lastRun: latestRun,
        status,
        tone,
        message: latestRun
          ? `Last updated ${formatDate(latestRun.updated_at || latestRun.created_at)}`
          : 'No recent runs recorded',
      }
    })
  }, [runs])

  return (
    <SurfaceCard className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-slate-800">Pipeline Status</h2>
          <p className="text-sm text-slate-500">
            Latest GitHub Actions runs for ETL, trading, and settlement.
          </p>
        </div>
        <a
          href="/automation"
          className="rounded-full bg-brand px-4 py-2 text-xs font-semibold text-white shadow transition hover:bg-brand-dark"
        >
          View Timeline
        </a>
      </div>

      {error && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          {error}
        </div>
      )}

      {loading && runs.length === 0 ? (
        <p className="text-sm text-slate-500">Loading workflow status…</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-3">
          {summaries.map((summary) => (
            <div
              key={summary.workflow}
              className="space-y-2 rounded-xl border border-brand-muted/60 bg-brand-muted/20 p-4 text-sm text-slate-600"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-slate-800">{summary.label}</span>
                <StatusBadge tone={summary.tone}>{summary.status}</StatusBadge>
              </div>
              <p className="text-xs text-slate-500">
                {summary.message}
              </p>
              {summary.lastRun?.html_url && (
                <a
                  href={summary.lastRun.html_url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs font-semibold text-brand hover:text-brand-light"
                >
                  View run →
                </a>
              )}
            </div>
          ))}
        </div>
      )}
    </SurfaceCard>
  )
}
