/**
 * Workflow v2 extended step types.
 *
 * These supplement the ActionDef / ActionType defined in contracts/rules.ts.
 * The executor-v2 handles the new types; the existing runner handles legacy ones.
 */

// ─── Extended step type union ─────────────────────────────────────────────────

export type WorkflowStepType =
  // Existing (keep these)
  | 'create_record'
  | 'update_record'
  | 'delete_record'
  | 'run_query'
  | 'set_variable'
  | 'show_toast'
  | 'navigate'
  // New in v2
  | 'if_else'
  | 'switch'
  | 'for_each'
  | 'while'
  | 'try_catch'
  | 'transaction'
  | 'wait_delay'
  | 'wait_approval'
  | 'send_email'
  | 'send_whatsapp'
  | 'generate_pdf'
  | 'post_stock'
  | 'convert_to'
  | 'call_script'
  | 'http_request'
  | 'schedule';

// ─── Base step ────────────────────────────────────────────────────────────────

export interface BaseWorkflowStep {
  id: string;
  type: WorkflowStepType;
  label?: string;
  continueOnError?: boolean;
}

// ─── Control flow steps ───────────────────────────────────────────────────────

export interface IfElseStep extends BaseWorkflowStep {
  type: 'if_else';
  condition: string;
  trueSteps: WorkflowStep[];
  falseSteps: WorkflowStep[];
}

export interface SwitchStep extends BaseWorkflowStep {
  type: 'switch';
  expression: string;
  cases: Array<{
    value: string | number | boolean;
    steps: WorkflowStep[];
  }>;
  defaultSteps?: WorkflowStep[];
}

export interface ForEachStep extends BaseWorkflowStep {
  type: 'for_each';
  sourceExpression: string;
  itemVariable: string;
  steps: WorkflowStep[];
  maxIterations: number;
}

export interface WhileStep extends BaseWorkflowStep {
  type: 'while';
  condition: string;
  steps: WorkflowStep[];
  maxIterations: number;
}

export interface TryCatchStep extends BaseWorkflowStep {
  type: 'try_catch';
  trySteps: WorkflowStep[];
  catchSteps: WorkflowStep[];
  finallySteps?: WorkflowStep[];
  errorVariable?: string;
}

export interface TransactionStep extends BaseWorkflowStep {
  type: 'transaction';
  steps: WorkflowStep[];
}

// ─── Async / wait steps ───────────────────────────────────────────────────────

export interface WaitDelayStep extends BaseWorkflowStep {
  type: 'wait_delay';
  delaySeconds: number;
}

export interface WaitApprovalStep extends BaseWorkflowStep {
  type: 'wait_approval';
  approvalFlowId: string;
  approverExpression: string;
  timeoutHours?: number;
  onTimeout: 'escalate' | 'auto_approve' | 'auto_reject';
}

// ─── Communication steps ──────────────────────────────────────────────────────

export interface SendEmailStep extends BaseWorkflowStep {
  type: 'send_email';
  toExpression: string;
  subjectExpression: string;
  bodyExpression: string;
  templateId?: string;
}

export interface SendWhatsAppStep extends BaseWorkflowStep {
  type: 'send_whatsapp';
  toExpression: string;
  templateName: string;
  templateParams: Record<string, string>;
}

export interface GeneratePdfStep extends BaseWorkflowStep {
  type: 'generate_pdf';
  templateId: string;
  dataExpression: string;
  outputVariable: string;
  attachToRecordExpression?: string;
}

// ─── Data / business steps ────────────────────────────────────────────────────

export interface PostStockStep extends BaseWorkflowStep {
  type: 'post_stock';
  movementType: 'in' | 'out' | 'transfer' | 'adjustment';
  itemExpression: string;
  quantityExpression: string;
  locationExpression?: string;
}

export interface ConvertToStep extends BaseWorkflowStep {
  type: 'convert_to';
  sourceRecordExpression: string;
  targetTableId: string;
  fieldMappings: Record<string, string>;
  outputVariable: string;
}

export interface HttpRequestStep extends BaseWorkflowStep {
  type: 'http_request';
  url: string;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  headers: Record<string, string>;
  bodyExpression?: string;
  responseVariable: string;
  timeoutMs?: number;
}

export interface CallScriptStep extends BaseWorkflowStep {
  type: 'call_script';
  scriptId: string;
  inputExpression?: string;
  outputVariable?: string;
}

export interface ScheduleStep extends BaseWorkflowStep {
  type: 'schedule';
  cronExpression: string;
  timezone?: string;
  targetWorkflowId: string;
}

// ─── Simple action steps ──────────────────────────────────────────────────────

export interface CreateRecordStep extends BaseWorkflowStep {
  type: 'create_record';
  tableId: string;
  data: Record<string, string>;
  outputVariable?: string;
}

export interface UpdateRecordStep extends BaseWorkflowStep {
  type: 'update_record';
  tableId: string;
  recordIdExpression: string;
  data: Record<string, string>;
}

export interface DeleteRecordStep extends BaseWorkflowStep {
  type: 'delete_record';
  tableId: string;
  recordIdExpression: string;
}

export interface RunQueryStep extends BaseWorkflowStep {
  type: 'run_query';
  sql: string;
  params?: string[];
  outputVariable?: string;
}

export interface SetVariableStep extends BaseWorkflowStep {
  type: 'set_variable';
  name: string;
  valueExpression: string;
}

export interface ShowToastStep extends BaseWorkflowStep {
  type: 'show_toast';
  messageExpression: string;
  level: 'info' | 'success' | 'warning' | 'error';
}

export interface NavigateStep extends BaseWorkflowStep {
  type: 'navigate';
  urlExpression: string;
}

// ─── Discriminated union ──────────────────────────────────────────────────────

export type WorkflowStep =
  | IfElseStep
  | SwitchStep
  | ForEachStep
  | WhileStep
  | TryCatchStep
  | TransactionStep
  | WaitDelayStep
  | WaitApprovalStep
  | SendEmailStep
  | SendWhatsAppStep
  | GeneratePdfStep
  | PostStockStep
  | ConvertToStep
  | HttpRequestStep
  | CallScriptStep
  | ScheduleStep
  | CreateRecordStep
  | UpdateRecordStep
  | DeleteRecordStep
  | RunQueryStep
  | SetVariableStep
  | ShowToastStep
  | NavigateStep;

// ─── Workflow v2 definition ───────────────────────────────────────────────────

export interface WorkflowDefV2 {
  id: string;
  appId: string;
  name: string;
  description?: string;
  steps: WorkflowStep[];
  enabled: boolean;
  version: 2;
  runTimeoutSeconds?: number;
  maxLoopIterations?: number;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Resumption token (for wait_approval) ────────────────────────────────────

export interface WorkflowResumptionToken {
  runId: string;
  workflowId: string;
  stepId: string;
  approvalRequestId: string;
  resumeAt: 'after_step';
  contextSnapshot: Record<string, unknown>;
  createdAt: Date;
  expiresAt?: Date;
}
