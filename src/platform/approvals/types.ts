/**
 * Core types for the approvals engine.
 */

export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'escalated' | 'delegated';

export interface ApprovalRequest {
  id: string;
  chainId: string;         // ApprovalChainDef.id
  tableId: string;
  recordId: string;
  tenantSlug: string;
  currentLevel: number;    // 1-based
  status: ApprovalStatus;
  amountValue?: number;    // for amount-range routing
  requestedBy: string;     // userId
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
  delegateTo?: string;     // userId, required when action='delegate'
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
