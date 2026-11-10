/**
 * POST /api/runtime/workflow/execute
 *
 * Executes a workflow by ID using the canonical executor-v2.
 * Requires either a valid tenant session or a matching webhook secret.
 */
import { NextRequest, NextResponse } from 'next/server'
import { pgPool } from '@/lib/db/client'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/config'
import { runWorkflowV2 } from '@/platform/workflows/executor-v2'
import type { WorkflowDefV2, WorkflowStep } from '@/platform/workflows/types-v2'
import exprEngine from '@/platform/expr/engine'
import { randomUUID } from 'crypto'

function sanitizeSlug(slug: string): string {
  return slug.replace(/[^a-z0-9_]/g, '_')
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = await req.json() as {
      workflowId?: string
      tenantSlug?: string
      event?: string
      payload?: Record<string, unknown>
      record?: Record<string, unknown>
      webhookSecret?: string
    }

    if (!body.workflowId) {
      return NextResponse.json({ error: 'workflowId required' }, { status: 400 })
    }
    if (!body.tenantSlug) {
      return NextResponse.json({ error: 'tenantSlug required' }, { status: 400 })
    }

    // Auth: session OR webhook secret (checked after loading workflow)
    const session = await getServerSession(authOptions)
    const schema = `tenant_${sanitizeSlug(body.tenantSlug)}`

    const wfResult = await pgPool.query<{
      id: string
      name: string
      app_id: string
      trigger: Record<string, unknown>
      steps: unknown
      actions: unknown
      enabled: boolean
    }>(
      `SELECT id, name, app_id, trigger,
              COALESCE(steps, actions) AS steps,
              enabled
       FROM "${schema}".workflows WHERE id = $1 LIMIT 1`,
      [body.workflowId]
    )

    if (wfResult.rows.length === 0) {
      return NextResponse.json({ error: 'Workflow not found' }, { status: 404 })
    }

    const wf = wfResult.rows[0]
    if (!wf.enabled) {
      return NextResponse.json({ error: 'Workflow is not enabled' }, { status: 400 })
    }

    // Webhook secret validation (unauthenticated webhook trigger path)
    const isWebhook = body.event === 'webhook'
    if (isWebhook && wf.trigger?.webhookSecret) {
      if (body.webhookSecret !== wf.trigger.webhookSecret) {
        return NextResponse.json({ error: 'Invalid webhook secret' }, { status: 403 })
      }
    } else if (!isWebhook && !session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Build WorkflowDefV2 from DB row (steps may be stored as 'actions' in older rows)
    const workflow: WorkflowDefV2 = {
      id: wf.id,
      name: wf.name,
      appId: wf.app_id,
      enabled: wf.enabled,
      version: 2,
      steps: Array.isArray(wf.steps) ? (wf.steps as WorkflowStep[]) : [],
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    // Build WorkflowContext for v2 executor
    const user = session?.user
    const wfCtx = {
      variables: {},
      triggerData: {
        record: body.record ?? {},
        payload: body.payload ?? {},
        event: body.event ?? 'manual',
      },
      user: {
        id: user?.id ?? 'system',
        role: user?.roleId ?? 'guest',
        roles: user?.roleId ? [user.roleId] : [],
      },
      tenantSlug: body.tenantSlug,
      runId: randomUUID(),
      stepPath: [] as string[],
    }

    const result = await runWorkflowV2(workflow, wfCtx, {
      pool: pgPool,
      exprEngine,
    })

    return NextResponse.json(result)
  } catch (err) {
    console.error('POST /api/runtime/workflow/execute error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
