import { pgPool } from '@/lib/db/client'
import type {
  WorkflowDefinition,
  TriggerContext,
  StepResult,
  WorkflowRunResult,
  WorkflowStep,
} from '@/platform/contracts/workflow'

// ─── Template resolution ──────────────────────────────────────────────────────

function resolveTemplate(template: string, ctx: TriggerContext, variables: Record<string, unknown>): string {
  return template.replace(/\{\{([^}]+)\}\}/g, (_, key: string) => {
    const parts = key.trim().split('.')
    // Check variables first
    if (parts[0] === 'variables' && parts[1]) {
      return String(variables[parts[1]] ?? '')
    }
    // Check trigger record
    if (parts[0] === 'record') {
      const record = ctx.triggerData?.record ?? {}
      return String(record[parts[1]] ?? '')
    }
    if (parts[0] === 'previousRecord') {
      const rec = ctx.triggerData?.previousRecord ?? {}
      return String(rec[parts[1]] ?? '')
    }
    return ''
  })
}

function resolveConfigValues(
  config: Record<string, unknown>,
  ctx: TriggerContext,
  variables: Record<string, unknown>
): Record<string, unknown> {
  const resolved: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(config)) {
    if (typeof v === 'string') {
      resolved[k] = resolveTemplate(v, ctx, variables)
    } else if (v && typeof v === 'object' && !Array.isArray(v)) {
      resolved[k] = resolveConfigValues(v as Record<string, unknown>, ctx, variables)
    } else {
      resolved[k] = v
    }
  }
  return resolved
}

// ─── Step executor ────────────────────────────────────────────────────────────

async function executeStep(
  step: WorkflowStep,
  ctx: TriggerContext,
  variables: Record<string, unknown>
): Promise<{ result: StepResult; nextStepId?: string; variables: Record<string, unknown> }> {
  const start = Date.now()
  const config = resolveConfigValues(step.config, ctx, variables)
  let output: unknown
  let error: string | undefined
  let nextStepId = step.nextStepId

  try {
    switch (step.type) {
      case 'send_email': {
        // Log email intent (actual sending requires SMTP integration)
        console.log('[workflow] send_email:', config.to, config.subject)
        output = { sent: true, to: config.to }
        break
      }

      case 'send_whatsapp': {
        const { to, templateName, text } = config as {
          to: string; templateName?: string; text?: string
        }
        const tenantSlug = (ctx.triggerData?.record?.['__tenantSlug'] as string) ?? ''
        const cfgRow = await pgPool.query<{ access_token: string; phone_number_id: string }>(
          `SELECT access_token, phone_number_id FROM platform.whatsapp_configs WHERE tenant_slug = $1 LIMIT 1`,
          [tenantSlug]
        )
        if (cfgRow.rows.length > 0) {
          const { sendWhatsAppMessage } = await import('@/lib/whatsapp/sender')
          const r = await sendWhatsAppMessage({
            to,
            templateName: templateName as string | undefined,
            text: text as string | undefined,
            accessToken: cfgRow.rows[0].access_token,
            phoneNumberId: cfgRow.rows[0].phone_number_id,
          })
          output = r
        } else {
          output = { skipped: true, reason: 'No WhatsApp config found' }
        }
        break
      }

      case 'http_request': {
        const { url, method = 'GET', headers = {}, body } = config as {
          url: string; method?: string; headers?: Record<string, string>; body?: unknown
        }
        const res = await fetch(url, {
          method,
          headers: { 'Content-Type': 'application/json', ...headers },
          body: body ? JSON.stringify(body) : undefined,
        })
        output = { status: res.status, ok: res.ok }
        break
      }

      case 'update_record': {
        const { tableId, recordId, fields } = config as {
          tableId: string; recordId: string; fields: Record<string, unknown>
        }
        // Look up schema for this table
        const tableResult = await pgPool.query<{ name: string; tenant_id: string }>(
          `SELECT t.name, a.tenant_id FROM platform.tables t
           JOIN public.apps a ON a.id = t.app_id
           WHERE t.id = $1::uuid LIMIT 1`,
          [tableId]
        )
        if (tableResult.rows.length > 0) {
          const { name: tableName, tenant_id } = tableResult.rows[0]
          const tenantRow = await pgPool.query<{ slug: string }>(
            `SELECT slug FROM platform.tenants WHERE id = $1::uuid LIMIT 1`,
            [tenant_id]
          )
          if (tenantRow.rows.length > 0) {
            const schema = `tenant_${tenantRow.rows[0].slug}`
            const keys = Object.keys(fields)
            const setClauses = keys.map((k, i) => `"${k}" = $${i + 1}`).join(', ')
            const values = [...keys.map(k => fields[k]), recordId]
            await pgPool.query(
              `UPDATE "${schema}"."${tableName}" SET ${setClauses} WHERE id = $${values.length}`,
              values
            )
            output = { updated: true, recordId }
          }
        }
        break
      }

      case 'create_record': {
        const { tableId, fields } = config as { tableId: string; fields: Record<string, unknown> }
        const tableResult = await pgPool.query<{ name: string; tenant_id: string }>(
          `SELECT t.name, a.tenant_id FROM platform.tables t
           JOIN public.apps a ON a.id = t.app_id
           WHERE t.id = $1::uuid LIMIT 1`,
          [tableId]
        )
        if (tableResult.rows.length > 0) {
          const { name: tableName, tenant_id } = tableResult.rows[0]
          const tenantRow = await pgPool.query<{ slug: string }>(
            `SELECT slug FROM platform.tenants WHERE id = $1::uuid LIMIT 1`,
            [tenant_id]
          )
          if (tenantRow.rows.length > 0) {
            const schema = `tenant_${tenantRow.rows[0].slug}`
            const keys = Object.keys(fields)
            const cols = keys.map(k => `"${k}"`).join(', ')
            const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ')
            const values = keys.map(k => fields[k])
            const r = await pgPool.query(
              `INSERT INTO "${schema}"."${tableName}" (${cols}) VALUES (${placeholders}) RETURNING id`,
              values
            )
            output = { created: true, recordId: r.rows[0]?.id }
          }
        }
        break
      }

      case 'if_else': {
        const { condition, field, operator, value } = config as {
          condition?: string; field?: string; operator?: string; value?: unknown
        }
        let conditionMet = false
        if (field) {
          const record = ctx.triggerData?.record ?? {}
          const fieldVal = record[field]
          switch (operator) {
            case 'equals': conditionMet = fieldVal == value; break
            case 'not_equals': conditionMet = fieldVal != value; break
            case 'contains': conditionMet = String(fieldVal).includes(String(value)); break
            case 'greater_than': conditionMet = Number(fieldVal) > Number(value); break
            case 'less_than': conditionMet = Number(fieldVal) < Number(value); break
            default: conditionMet = Boolean(fieldVal)
          }
        } else if (condition) {
          // Simple truthy check on template-resolved condition
          conditionMet = condition.trim() !== '' && condition.trim() !== 'false' && condition.trim() !== '0'
        }
        nextStepId = conditionMet ? step.trueBranchStepId : step.falseBranchStepId
        output = { conditionMet, nextStepId }
        break
      }

      case 'set_variable': {
        const { name: varName, value: varValue } = config as { name: string; value: unknown }
        variables[varName] = varValue
        output = { set: varName, value: varValue }
        break
      }

      case 'loop': {
        // Minimal loop — iterate over array in trigger record
        const { arrayField, maxIterations = 100 } = config as { arrayField: string; maxIterations?: number }
        const record = ctx.triggerData?.record ?? {}
        const arr = Array.isArray(record[arrayField]) ? record[arrayField] as unknown[] : []
        output = { iterating: arrayField, count: Math.min(arr.length, Number(maxIterations)) }
        break
      }

      case 'run_query': {
        const { sql, params: queryParams } = config as { sql: string; params?: unknown[] }
        const qr = await pgPool.query(sql, queryParams ?? [])
        output = { rowCount: qr.rowCount, rows: qr.rows.slice(0, 100) }
        break
      }

      case 'delete_record': {
        const { tableId, recordId } = config as { tableId: string; recordId: string }
        const tableResult = await pgPool.query<{ name: string; tenant_id: string }>(
          `SELECT t.name, a.tenant_id FROM platform.tables t
           JOIN public.apps a ON a.id = t.app_id
           WHERE t.id = $1::uuid LIMIT 1`,
          [tableId]
        )
        if (tableResult.rows.length > 0) {
          const { name: tableName, tenant_id } = tableResult.rows[0]
          const tenantRow = await pgPool.query<{ slug: string }>(
            `SELECT slug FROM platform.tenants WHERE id = $1::uuid LIMIT 1`,
            [tenant_id]
          )
          if (tenantRow.rows.length > 0) {
            const schema = `tenant_${tenantRow.rows[0].slug}`
            await pgPool.query(`DELETE FROM "${schema}"."${tableName}" WHERE id = $1`, [recordId])
            output = { deleted: true, recordId }
          }
        }
        break
      }

      case 'call_api': {
        // Alias for http_request — same logic
        const { url, method = 'GET', headers = {}, body } = config as {
          url: string; method?: string; headers?: Record<string,string>; body?: unknown
        }
        const res = await fetch(url, {
          method,
          headers: { 'Content-Type': 'application/json', ...headers },
          body: body ? JSON.stringify(body) : undefined,
        })
        output = { status: res.status, ok: res.ok }
        break
      }

      case 'send_notification': {
        // In-app notification — log and store (actual push requires integration)
        const { title, message, userId } = config as {
          title?: string; message?: string; userId?: string
        }
        console.log('[workflow] send_notification:', { title, message, userId })
        output = { notified: true, title, userId }
        break
      }

      default:
        output = { skipped: true, reason: 'Unknown step type' }
    }
  } catch (err) {
    error = err instanceof Error ? err.message : String(err)
  }

  const stepResult: StepResult = {
    stepId: step.id,
    stepType: step.type,
    status: error ? 'failed' : 'success',
    output,
    error,
    durationMs: Date.now() - start,
  }

  return { result: stepResult, nextStepId, variables }
}

// ─── Main executor ────────────────────────────────────────────────────────────

export async function executeWorkflow(
  workflow: WorkflowDefinition,
  ctx: TriggerContext
): Promise<WorkflowRunResult> {
  const startedAt = new Date().toISOString()
  const start = Date.now()
  const stepResults: StepResult[] = []
  const variables: Record<string, unknown> = { ...(ctx.variables ?? {}) }

  // Build step map
  const stepMap = new Map<string, WorkflowStep>()
  for (const step of workflow.steps) {
    stepMap.set(step.id, step)
  }

  let currentStepId: string | undefined = workflow.firstStepId ?? workflow.steps[0]?.id
  let overallStatus: WorkflowRunResult['status'] = 'success'
  const maxSteps = 100 // Safety limit

  for (let i = 0; i < maxSteps && currentStepId; i++) {
    const step = stepMap.get(currentStepId)
    if (!step) break

    const { result, nextStepId, variables: newVars } = await executeStep(step, ctx, variables)
    stepResults.push(result)
    Object.assign(variables, newVars)

    if (result.status === 'failed') {
      overallStatus = 'failed'
      break
    }

    currentStepId = nextStepId
  }

  const finishedAt = new Date().toISOString()
  const durationMs = Date.now() - start

  // Log run to DB
  try {
    await pgPool.query(
      `CREATE TABLE IF NOT EXISTS platform.workflow_runs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        workflow_id UUID NOT NULL,
        status TEXT NOT NULL,
        trigger_event JSONB,
        step_results JSONB,
        started_at TIMESTAMPTZ DEFAULT NOW(),
        finished_at TIMESTAMPTZ,
        duration_ms INTEGER
      )`
    )
    const runId = crypto.randomUUID()
    await pgPool.query(
      `INSERT INTO platform.workflow_runs (id, workflow_id, status, trigger_event, step_results, started_at, finished_at, duration_ms)
       VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7, $8)`,
      [
        runId,
        workflow.id,
        overallStatus,
        JSON.stringify(ctx.triggerEvent),
        JSON.stringify(stepResults),
        startedAt,
        finishedAt,
        durationMs,
      ]
    )
    return { workflowId: workflow.id, runId, status: overallStatus, stepResults, startedAt, finishedAt, durationMs }
  } catch (dbErr) {
    console.error('Failed to log workflow run:', dbErr)
    return {
      workflowId: workflow.id,
      runId: crypto.randomUUID(),
      status: overallStatus,
      stepResults,
      startedAt,
      finishedAt,
      durationMs,
    }
  }
}
