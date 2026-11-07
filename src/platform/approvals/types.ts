/**
 * Core types for the approvals engine.
 * Extended for spec 3.3.
 */

export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'escalated' | 'delegated';

export interface ApprovalRequest {
  id: string;
  chainId: string;
  tableId: string;
  recordId: string;
  tenantSlug: string;
  currentLevel: number;
  status: ApprovalStatus;
  amountValue?: number;
  requestedBy: string;
  requestedAt: Date;
  decidedAt?: Date;
  decidedBy?: string;
  comments?: string;
  delegatedTo?: string;
}

export interface ApprovalDecision {
  requestId: string;
  decidedBy: string;
  action: 'approve' | 'reject' | 'delegate';
  delegateTo?: string;
  comments?: string;
}

export interface ApprovalLevelDecision {
  id: string;
  requestId: string;
  level: number;
  approverId: string;
  action: 'approve' | 'reject' | 'delegate';
  decidedAt: Date;
  comments?: string;
}

export interface ApprovalChainDef {
  id: string;
  appId: string;
  name: string;
  tableApiKey: string;
  triggerExpr?: string;
  levels: ApprovalLevelDef[];
}

export interface ApprovalLevelDef {
  id: string;
  order: number;
  name: string;
  mode: 'sequential' | 'parallel';
  approvers: ApproverDef[];
  escalationHours?: number;
  escalateTo?: ApproverDef;
  requiredCount?: number;
}

export interface ApproverDef {
  type: 'role' | 'user' | 'field';
  roleId?: string;
  userId?: string;
  fieldApiKey?: string;
  amountThreshold?: { min?: number; max?: number; fieldApiKey: string };
}

export type ApprovalDecisionType = 'approved' | 'rejected' | 'delegated';

export interface ApprovalRequestV2 {
  id: string;
  chainId: string;
  appId: string;
  tenantSlug: string;
  tableApiKey: string;
  recordId: string;
  currentLevel: number;
  status: 'pending' | 'approved' | 'rejected' | 'escalated';
  createdAt: Date;
  updatedAt: Date;
}

export interface ApprovalAction {
  id: string;
  requestId: string;
  level: number;
  approverId: string;
  decision: ApprovalDecisionType;
  comment?: string;
  delegatedTo?: string;
  decidedAt: Date;
}

export interface ApprovalDeps {
  db: {
    query: <T = Record<string, unknown>>(
      sql: string,
      params?: unknown[],
    ) => Promise<{ rows: T[] }>;
  };
  notify?: (userId: string, payload: Record<string, unknown>) => Promise<void>;
  dispatchWorkflowEvent?: (
    appId: string,
    event: string,
    payload: Record<string, unknown>,
  ) => Promise<void>;
  getChain: (chainId: string) => Promise<ApprovalChainDef | null>;
}
