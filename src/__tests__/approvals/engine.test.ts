/**
 * Tests for the approvals engine (spec 3.3).
 */

import {
  startApproval,
  decideApproval,
  checkEscalations,
} from '@/platform/approvals/engine';
import type {
  ApprovalChainDef,
  ApprovalRequestV2,
  ApprovalAction,
  ApprovalDeps,
} from '@/platform/approvals/types';

interface MockDB {
  requests: Record<string, ApprovalRequestV2>;
  actions: ApprovalAction[];
  query: ApprovalDeps['db']['query'];
}

function makeMockDB(): MockDB {
  const requests: Record<string, ApprovalRequestV2> = {};
  const actions: ApprovalAction[] = [];

  const query = async <T = Record<string, unknown>>(
    sql: string,
    params: unknown[] = [],
  ): Promise<{ rows: T[] }> => {
    if (sql.includes('INSERT INTO platform.approval_requests')) {
      const id = params[0] as string;
      const req: ApprovalRequestV2 = {
        id,
        chainId: params[1] as string,
        appId: params[2] as string,
        tenantSlug: params[3] as string,
        tableApiKey: params[4] as string,
        recordId: params[5] as string,
        currentLevel: params[6] as number,
        status: 'pending',
        createdAt: new Date(params[8] as string),
        updatedAt: new Date(params[8] as string),
      };
      requests[id] = req;
      return { rows: [toRow(req)] as unknown as T[] };
    }
    if (sql.includes('SELECT * FROM platform.approval_requests WHERE id =')) {
      const id = params[0] as string;
      const req = requests[id];
      return { rows: (req ? [toRow(req)] : []) as unknown as T[] };
    }
    if (sql.includes("WHERE status='pending'")) {
      const pending = Object.values(requests).filter((r) => r.status === 'pending');
      return { rows: pending.map(toRow) as unknown as T[] };
    }
    if (sql.includes('SET status=') || sql.includes("SET status='")) {
      const id = params[0] as string;
      const req = requests[id];
      if (req) {
        const m = sql.match(/SET status='(\w+)'/);
        if (m) req.status = m[1] as ApprovalRequestV2['status'];
        req.updatedAt = new Date(params[1] as string);
      }
      return { rows: [] as T[] };
    }
    if (sql.includes('SET current_level=')) {
      const id = params[0] as string;
      const req = requests[id];
      if (req) {
        req.currentLevel = params[1] as number;
        req.status = 'pending';
        req.updatedAt = new Date(params[2] as string);
      }
      return { rows: [] as T[] };
    }
    if (sql.includes('INSERT INTO platform.approval_actions')) {
      const action: ApprovalAction = {
        id: params[0] as string,
        requestId: params[1] as string,
        level: params[2] as number,
        approverId: params[3] as string,
        decision: params[4] as ApprovalAction['decision'],
        comment: params[5] as string | undefined,
        delegatedTo: params[6] as string | undefined,
        decidedAt: new Date(params[7] as string),
      };
      actions.push(action);
      return { rows: [] as T[] };
    }
    if (sql.includes('SELECT DISTINCT approver_id')) {
      const reqId = params[0] as string;
      const level = params[1] as number;
      const approvers = actions
        .filter((a) => a.requestId === reqId && a.level === level && a.decision === 'approved')
        .map((a) => a.approverId);
      const distinct = [...new Set(approvers)].map((id) => ({ approver_id: id }));
      return { rows: distinct as unknown as T[] };
    }
    if (sql.includes('SELECT id FROM platform.approval_actions')) {
      const reqId = params[0] as string;
      const level = params[1] as number;
      const found = actions.filter((a) => a.requestId === reqId && a.level === level);
      return { rows: found.slice(0, 1) as unknown as T[] };
    }
    return { rows: [] as T[] };
  };

  return { requests, actions, query };
}

function toRow(r: ApprovalRequestV2): Record<string, unknown> {
  return {
    id: r.id, chain_id: r.chainId, app_id: r.appId, tenant_slug: r.tenantSlug,
    table_api_key: r.tableApiKey, record_id: r.recordId, current_level: r.currentLevel,
    status: r.status, created_at: r.createdAt.toISOString(), updated_at: r.updatedAt.toISOString(),
  };
}

function twoLevelChain(): ApprovalChainDef {
  return {
    id: 'chain-1', appId: 'app-1', name: 'PO Approval', tableApiKey: 'purchase_orders',
    levels: [
      { id: 'l1', order: 1, name: 'Manager', mode: 'sequential', approvers: [{ type: 'user', userId: 'manager-1' }] },
      { id: 'l2', order: 2, name: 'Director', mode: 'sequential', approvers: [{ type: 'user', userId: 'director-1' }] },
    ],
  };
}

function parallelChain(requiredCount: number): ApprovalChainDef {
  return {
    id: 'chain-par', appId: 'app-1', name: 'Parallel', tableApiKey: 'invoices',
    levels: [{
      id: 'lp', order: 1, name: 'Multi', mode: 'parallel', requiredCount,
      approvers: [
        { type: 'user', userId: 'approver-a' },
        { type: 'user', userId: 'approver-b' },
        { type: 'user', userId: 'approver-c' },
      ],
    }],
  };
}

type WithMeta = ApprovalDeps & {
  _events: Array<{ appId: string; event: string; payload: Record<string, unknown> }>;
};

function makeDeps(db: MockDB, chain: ApprovalChainDef): WithMeta {
  const events: Array<{ appId: string; event: string; payload: Record<string, unknown> }> = [];
  return {
    db: { query: db.query },
    notify: async (_userId: string, _payload: Record<string, unknown>) => { return; },
    dispatchWorkflowEvent: async (appId: string, event: string, payload: Record<string, unknown>) => { events.push({ appId, event, payload }); },
    getChain: async (chainId: string) => (chainId === chain.id ? chain : null),
    _events: events,
  };
}

describe('startApproval', () => {
  it('creates a request at level 1', async () => {
    const chain = twoLevelChain();
    const db = makeMockDB();
    const deps = makeDeps(db, chain);
    const req = await startApproval('chain-1', 'record-42', 'initiator', deps);
    expect(req.id).toBeTruthy();
    expect(req.currentLevel).toBe(1);
    expect(req.status).toBe('pending');
  });
});

describe('decideApproval - sequential 2-level flow', () => {
  it('advances to level 2 after level-1 approval', async () => {
    const chain = twoLevelChain();
    const db = makeMockDB();
    const deps = makeDeps(db, chain);
    const req = await startApproval('chain-1', 'record-1', 'initiator', deps);
    const result = await decideApproval(req.id, 'manager-1', 'approved', undefined, undefined, deps);
    expect(result.newStatus).toBe('pending');
    expect(result.advancedToLevel).toBe(2);
    expect(db.requests[req.id].currentLevel).toBe(2);
  });

  it('fully approves after level-2 approval and fires workflow event', async () => {
    const chain = twoLevelChain();
    const db = makeMockDB();
    const deps = makeDeps(db, chain);
    const req = await startApproval('chain-1', 'record-2', 'initiator', deps);
    await decideApproval(req.id, 'manager-1', 'approved', undefined, undefined, deps);
    const r2 = await decideApproval(req.id, 'director-1', 'approved', 'LGTM', undefined, deps);
    expect(r2.newStatus).toBe('approved');
    expect(deps._events[0]).toMatchObject({ event: 'approval_decided', payload: { decision: 'approved' } });
  });
});

describe('decideApproval - rejection', () => {
  it('sets status to rejected and fires workflow event', async () => {
    const chain = twoLevelChain();
    const db = makeMockDB();
    const deps = makeDeps(db, chain);
    const req = await startApproval('chain-1', 'record-3', 'initiator', deps);
    const result = await decideApproval(req.id, 'manager-1', 'rejected', 'No', undefined, deps);
    expect(result.newStatus).toBe('rejected');
    expect(db.requests[req.id].status).toBe('rejected');
    expect(deps._events[0]).toMatchObject({ event: 'approval_decided', payload: { decision: 'rejected' } });
  });
});

describe('decideApproval - parallel with requiredCount=2', () => {
  it('stays pending until requiredCount approvers have approved', async () => {
    const chain = parallelChain(2);
    const db = makeMockDB();
    const deps = makeDeps(db, chain);
    const req = await startApproval('chain-par', 'record-4', 'initiator', deps);
    const r1 = await decideApproval(req.id, 'approver-a', 'approved', undefined, undefined, deps);
    expect(r1.newStatus).toBe('pending');
    expect(r1.advancedToLevel).toBeUndefined();
    const r2 = await decideApproval(req.id, 'approver-b', 'approved', undefined, undefined, deps);
    expect(r2.newStatus).toBe('approved');
  });
});

describe('checkEscalations', () => {
  it('escalates an overdue pending request', async () => {
    const chain: ApprovalChainDef = {
      id: 'chain-esc', appId: 'app-1', name: 'Esc', tableApiKey: 'orders',
      levels: [{
        id: 'le', order: 1, name: 'L1', mode: 'sequential',
        escalationHours: 1,
        escalateTo: { type: 'user', userId: 'escalation-user' },
        approvers: [{ type: 'user', userId: 'approver-esc' }],
      }],
    };
    const db = makeMockDB();
    const deps = makeDeps(db, chain);
    const oldReq: ApprovalRequestV2 = {
      id: 'req-old', chainId: 'chain-esc', appId: 'app-1', tenantSlug: 'tenant1',
      tableApiKey: 'orders', recordId: 'rec-1', currentLevel: 1, status: 'pending',
      createdAt: new Date(Date.now() - 3 * 60 * 60 * 1000),
      updatedAt: new Date(Date.now() - 3 * 60 * 60 * 1000),
    };
    db.requests['req-old'] = oldReq;
    await checkEscalations(deps);
    expect(db.requests['req-old'].status).toBe('escalated');
  });
});
