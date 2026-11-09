import { NextRequest, NextResponse } from 'next/server'
import { pgPool } from '@/lib/db/client'
import { executeWorkflow } from '@/platform/engines/workflow/executor'
import type { TriggerContext } from '@/platform/contracts/workflow'

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

    // Workflows live in the tenant schema (where the builder saves them)
    const schema = `tenant_${sanitizeSlug(body.tenantSlug)}`

    const wfResult = await pgPool.query<{
      id: string
      name: string
      app_id: string
      trigger: Record<string, unknown>
      actions: unknown[]
      enabled: boolean
    }>(
      `SELECT id, name, app_id, trigger, actions, enabled FROM "${schema}".workflows WHERE id = $1 LIMIT 1`,
      [body.workflowId]
    )

    if (wfResult.rows.length === 0) {
      return NextResponse.json({ error: 'Workflow not found' }, { status: 404 })
    }

    const wf = wfResult.rows[0]
    if (!wf.enabled) {
      return NextResponse.json({ error: 'Workflow is not enabled' }, { status: 400 })
    }

    // Webhook secret validation
    if (body.event === 'webhook' && wf.trigger?.webhookSecret) {
      if (body.webhookSecret !== wf.trigger.webhookSecret) {
        return NextResponse.json({ error: 'Invalid webhook secret' }, { status: 403 })
      }
    }

    // Map tenant schema row format to WorkflowDefinition expected by executor
    const definition = {
      id: wf.id,
      name: wf.name,
      appId: wf.app_id,
      trigger: wf.trigger,
      steps: Array.isArray(wf.actions) ? wf.actions : [],
    }

    const ctx: TriggerContext = {
      triggerEvent: {
        type: (body.event as TriggerContext['triggerEvent']['type']) ?? 'manual',
        payload: body.payload,
        record: body.record,
      },
      triggerData: {
        record: body.record,
        payload: body.payload,
      },
    }

    const result = await executeWorkflow(definition as unknown as Parameters<typeof executeWorkflow>[0], ctx)
    return NextResponse.json(result)
  } catch (err) {
    console.error('POST /api/runtime/workflow/execute error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
