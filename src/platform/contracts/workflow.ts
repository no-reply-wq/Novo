// ─── Workflow Contracts ────────────────────────────────────────────────────────

export type TriggerEventType =
  | 'record.created'
  | 'record.updated'
  | 'record.deleted'
  | 'manual'
  | 'webhook'
  | 'schedule'

export interface TriggerEvent {
  type: TriggerEventType
  tableId?: string
  tableName?: string
  record?: Record<string, unknown>
  previousRecord?: Record<string, unknown>
  payload?: Record<string, unknown>
}

export interface WorkflowTrigger {
  event: TriggerEventType
  tableId?: string
  webhookSecret?: string
  cronExpression?: string
}

// ─── Step types ───────────────────────────────────────────────────────────────

export type StepType =
  | 'send_email'
  | 'send_whatsapp'
  | 'http_request'
  | 'update_record'
  | 'create_record'
  | 'delete_record'
  | 'if_else'
  | 'loop'
  | 'set_variable'
  | 'run_query'
  | 'call_api'
  | 'send_notification'

export interface WorkflowStep {
  id: string
  type: StepType
  name?: string
  config: Record<string, unknown>
  nextStepId?: string
  // For if_else
  trueBranchStepId?: string
  falseBranchStepId?: string
}

export interface WorkflowDefinition {
  id: string
  appId: string
  name: string
  trigger: WorkflowTrigger
  steps: WorkflowStep[]
  firstStepId?: string
  isActive: boolean
  createdAt?: string
  updatedAt?: string
}

// ─── Execution context ────────────────────────────────────────────────────────

export interface TriggerContext {
  triggerEvent: TriggerEvent
  triggerData?: {
    record?: Record<string, unknown>
    previousRecord?: Record<string, unknown>
    payload?: Record<string, unknown>
  }
  variables?: Record<string, unknown>
}

export interface StepResult {
  stepId: string
  stepType: StepType
  status: 'success' | 'failed' | 'skipped'
  output?: unknown
  error?: string
  durationMs?: number
}

export interface WorkflowRunResult {
  workflowId: string
  runId: string
  status: 'success' | 'failed' | 'partial'
  stepResults: StepResult[]
  error?: string
  startedAt: string
  finishedAt: string
  durationMs: number
}
