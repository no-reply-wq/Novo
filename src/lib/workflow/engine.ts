/**
 * Workflow engine — fires tenant workflows for a given event.
 * Called fire-and-forget (.catch(console.error)) so failures never block the API.
 */
import { tenantQuery, withTenantTransaction } from '@/lib/db/client';

export interface WorkflowEvent {
  schemaName: string;
  tenantSlug: string;
  event: string;           // e.g. 'form_submitted', 'row_created'
  entityId: string;
  entityType: string;
  data: Record<string, unknown>;
  userId?: string;
}

/**
 * Fetches active workflows that listen for `event` and runs each action.
 * Non-fatal: any per-workflow error is logged and skipped.
 */
export async function fireWorkflows(evt: WorkflowEvent): Promise<void> {
  const workflows = await tenantQuery<{
    id: string;
    name: string;
    actions: unknown;
  }>(
    evt.schemaName,
    `SELECT id, name, actions
     FROM workflows
     WHERE active = true
       AND trigger_event = $1
     LIMIT 50`,
    [evt.event]
  );

  for (const wf of workflows.rows) {
    try {
      await runWorkflow(wf, evt);
    } catch (e) {
      console.error(`[workflow] "${wf.name}" failed for event ${evt.event}:`, e);
    }
  }
}

async function runWorkflow(
  wf: { id: string; name: string; actions: unknown },
  evt: WorkflowEvent
): Promise<void> {
  const actions = Array.isArray(wf.actions) ? wf.actions : [];

  await withTenantTransaction(evt.schemaName, async (client) => {
    for (const action of actions as Array<Record<string, unknown>>) {
      switch (action.type) {
        case 'log':
          console.log(`[workflow:${wf.name}] log:`, action.message ?? evt.data);
          break;

        case 'update_field': {
          const table = String(action.table ?? '');
          const field = String(action.field ?? '');
          const value = action.value ?? null;
          if (table && field) {
            await client.query(
              `UPDATE ${table} SET ${field} = $1 WHERE id = $2`,
              [value, evt.entityId]
            );
          }
          break;
        }

        default:
          // Unknown action type — skip silently
          break;
      }
    }
  });
}
