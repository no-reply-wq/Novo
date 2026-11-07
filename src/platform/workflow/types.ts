/**
 * Workflow Engine v2 — type definitions (spec §3.1–3.2)
 */

export type TriggerType =
  | 'record_created' | 'record_updated' | 'record_deleted'
  | 'field_changed' | 'status_changed' | 'approval_decided'
  | 'form_submitted' | 'button_clicked'
  | 'schedule' | 'webhook' | 'whatsapp_message' | 'email_received';

export type StepType =
  | 'create_record' | 'update_record' | 'delete_record' | 'query_records'
  | 'set_variable' | 'if_else' | 'switch' | 'loop_forEach' | 'try_catch'
  | 'call_api' | 'send_email' | 'send_whatsapp' | 'generate_pdf'
  | 'post_stock' | 'convert_to' | 'start_approval'
  | 'wait_delay' | 'notify_user' | 'run_script';

export interface TriggerDef {
  type: TriggerType;
  tableApiKey?: string;
  fieldApiKey?: string;
  cronExpr?: string;
  webhookPath?: string;
}

export interface StepDef {
  id: string;
  type: StepType;
  name?: string;
  config: Record<string, unknown>;
  onError?: 'stop' | 'continue' | 'retry';
  retryCount?: number;
}

export interface WorkflowDef {
  id: string;
  appId: string;
  name: string;
  trigger: TriggerDef;
  steps: StepDef[];
  enabled: boolean;
  runInTransaction: boolean;
}

export interface TriggerEvent {
  type: TriggerType;
  appId: string;
  tenantSlug: string;
  tableApiKey?: string;
  fieldApiKey?: string;
  record?: Record<string, unknown>;
  oldRecord?: Record<string, unknown>;
  userId?: string;
}

export interface WorkflowContext {
  workflowId: string;
  runId: string;
  triggerData: Record<string, unknown>;
  variables: Record<string, unknown>;
  userId: string;
  tenantSlug: string;
  appId: string;
}

export interface StepResult {
  output: unknown;
  logs: string[];
}

export type WorkflowRunStatus = 'running' | 'completed' | 'failed' | 'timed_out';

export interface StepLog {
  stepId: string;
  name?: string;
  startedAt: Date;
  finishedAt: Date;
  input?: unknown;
  output?: unknown;
  error?: string;
}

export interface WorkflowRunResult {
  runId: string;
  workflowId: string;
  status: WorkflowRunStatus;
  startedAt: Date;
  finishedAt: Date;
  durationMs: number;
  stepLogs: StepLog[];
  error?: string;
}

export interface WorkflowDeps {
  pgPool: import('pg').Pool;
}
