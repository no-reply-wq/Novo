/**
 * Rule, workflow, trigger, action and approval contracts.
 *
 * RULE: Sub-agents may not change this file. Changes go through the Lead.
 */

// ─── RuleDef (data-layer rules) ──────────────────────────────────────────────

/**
 * A named validation or lock rule attached to a table.
 * Evaluated by the expression engine before INSERT / UPDATE.
 */
export interface RuleDef {
  id: string;
  tableId: string;
  name: string;
  ruleType: 'validation' | 'lock' | 'uniqueness';
  expression: string;       // must evaluate to boolean
  message: string;          // shown to the user on failure
  applyOn: Array<'insert' | 'update' | 'delete'>;
  enabled: boolean;
  rank: number;             // evaluation order (lower first)
  lockExceptionRoles?: string[];  // role ids allowed to bypass a lock rule
  createdAt: Date;
  updatedAt: Date;
}

// ─── TriggerDef ──────────────────────────────────────────────────────────────

export type TriggerEvent =
  | 'record_created'
  | 'record_updated'
  | 'record_deleted'
  | 'field_changed'         // conditionExpr identifies which field
  | 'status_changed'
  | 'approval_decided'
  | 'form_submitted'
  | 'button_clicked'
  | 'schedule'              // cron expression
  | 'webhook_incoming'
  | 'whatsapp_message'
  | 'email_received';

export interface TriggerDef {
  id: string;
  workflowId: string;
  event: TriggerEvent;
  tableId?: string;         // which table this trigger watches (record events)
  conditionExpr?: string;   // e.g. "field('status') changed to 'Approved'"
  cronExpr?: string;        // for 'schedule' triggers (UTC cron)
  webhookPath?: string;     // for 'webhook_incoming'
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// ─── ActionDef ───────────────────────────────────────────────────────────────

export type ActionType =
  | 'create_record'
  | 'update_record'
  | 'delete_record'
  | 'run_query'
  | 'set_variable'
  | 'if_else'
  | 'switch'
  | 'for_each'
  | 'try_catch'
  | 'call_api'
  | 'send_email'
  | 'send_whatsapp'
  | 'generate_pdf'
  | 'create_barcode'
  | 'post_stock'
  | 'convert_to'
  | 'start_approval'
  | 'wait_delay'
  | 'notify_user'
  | 'show_toast'
  | 'navigate'
  | 'run_script';

export interface ActionDef {
  id: string;
  workflowId: string;
  parentId?: string;        // null = top-level; set for nested (if/for-each children)
  rank: number;
  actionType: ActionType;
  label?: string;
  config: Record<string, unknown>;  // typed per actionType (see workflow/actions/ module)
  runInTransaction?: boolean;       // wrap this + siblings in one Postgres transaction
  continueOnError?: boolean;        // catch and log rather than abort the workflow
  createdAt: Date;
  updatedAt: Date;
}

// ─── WorkflowDef ─────────────────────────────────────────────────────────────

export interface WorkflowDef {
  id: string;
  appId: string;
  name: string;
  description?: string;
  trigger: TriggerDef;
  actions: ActionDef[];     // ordered list; nesting via parentId
  enabled: boolean;
  version: number;
  runTimeoutSeconds?: number; // default 30
  maxLoopIterations?: number; // loop-protection default 100
  createdAt: Date;
  updatedAt: Date;
}

// ─── Approval contracts ───────────────────────────────────────────────────────

export interface ApprovalLevel {
  rank: number;             // 1 = first approver
  approverType: 'role' | 'user' | 'expr';
  roleId?: string;
  userId?: string;
  approverExpr?: string;    // expression returning user id(s)
  amountMin?: number;       // amount-range routing
  amountMax?: number;
  mode: 'sequential' | 'parallel';
  escalateAfterHours?: number;
  escalateTo?: string;      // user id or expression
  allowDelegation?: boolean;
}

export interface ApprovalChainDef {
  id: string;
  appId: string;
  name: string;
  tableId: string;
  amountFieldId?: string;   // used for amount-range routing
  levels: ApprovalLevel[];
  onApproved?: ActionDef[];
  onRejected?: ActionDef[];
  createdAt: Date;
  updatedAt: Date;
}

// ─── ScriptDef (tenant scripts) ──────────────────────────────────────────────

export interface ScriptDef {
  id: string;
  appId: string;
  name: string;
  description?: string;
  language: 'javascript';    // only JS in the sandbox for now
  code: string;              // source code
  version: number;
  testCases?: Array<{
    name: string;
    input: Record<string, unknown>;
    expectedOutput?: unknown;
  }>;
  createdAt: Date;
  updatedAt: Date;
  publishedAt?: Date;
}
