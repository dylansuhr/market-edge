/**
 * Automation Runs API Route
 *
 * Fetches recent GitHub Actions workflow runs for ETL, trading, and settlement.
 */

import { NextResponse } from 'next/server'

const WORKFLOWS = ['market-data-etl.yml', 'trading-agent.yml', 'trade-settlement.yml']
const DEFAULT_LIMIT = 50

function getWorkflowFilters(searchParams: URLSearchParams) {
  const workflow = searchParams.get('workflow')

  if (!workflow || workflow === 'all') {
    return WORKFLOWS
  }

  if (WORKFLOWS.includes(workflow)) {
    return [workflow]
  }

  return WORKFLOWS
}

async function fetchRuns(owner: string, repo: string, workflow: string, token?: string, limit: number = DEFAULT_LIMIT) {
  const params = new URLSearchParams({
    per_page: Math.min(limit, 100).toString(),
    page: '1'
  })

  const res = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/actions/workflows/${workflow}/runs?${params.toString()}`,
    {
      headers: token
        ? {
            Authorization: `Bearer ${token}`,
            Accept: 'application/vnd.github+json'
          }
        : {
            Accept: 'application/vnd.github+json'
          },
      // cache for 5 minutes
      next: { revalidate: 300 }
    }
  )

  if (!res.ok) {
    throw new Error(`GitHub API responded with ${res.status} for ${workflow}`)
  }

  const data = await res.json()
  return Array.isArray(data.workflow_runs) ? data.workflow_runs : []
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const owner = process.env.GITHUB_OWNER
    const repo = process.env.GITHUB_REPO
    const token = process.env.GITHUB_TOKEN

  if (!owner || !repo) {
    return NextResponse.json({
      runs: [],
      error: 'GitHub repository not configured (set GITHUB_OWNER and GITHUB_REPO).'
    })
  }

    const workflows = getWorkflowFilters(searchParams)
    const limitParam = parseInt(searchParams.get('limit') || '50', 10)
    const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 100) : DEFAULT_LIMIT

    const runPromises = workflows.map(workflow =>
      fetchRuns(owner, repo, workflow, token, limit).then(runs =>
        runs.map((run: any) => ({
          workflow_name: run.name || workflow,
          workflow_file: workflow,
          run_id: run.id,
          event: run.event,
          status: run.status,
          conclusion: run.conclusion,
          created_at: run.created_at,
          updated_at: run.updated_at,
          html_url: run.html_url,
          actor: run.actor ? { login: run.actor.login, avatar_url: run.actor.avatar_url } : null
        }))
      )
    )

    const results = await Promise.all(runPromises)
    // Flatten and sort by most recent update
    const runs = results.flat().sort((a, b) => {
      const aTime = new Date(a.updated_at || a.created_at).getTime()
      const bTime = new Date(b.updated_at || b.created_at).getTime()
      return bTime - aTime
    })

    return NextResponse.json({ runs })
  } catch (error) {
    console.error('Automation API error:', error)
    return NextResponse.json({ runs: [], error: 'Failed to fetch automation runs from GitHub.' })
  }
}
