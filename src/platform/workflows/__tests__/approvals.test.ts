/**
 * Tests for the multi-level approval engine.
 * Uses an in-memory mock of Pool to avoid Postgres.
 */

import {
  createApprovalFlow,
  createApprovalRequest,
  decideApproval,
  processTimedOutApprovals,
  ApprovalNotFoundError,
  ApprovalAlreadyDecidedError,
  ApprovalUnauthorizedError,
} from '../approvals';
import type { ApprovalFlow, ApprovalLevel, ApprovalFlowMode } from '../approvals';
import type { Pool, PoolClient } from 'pg';

// ─── In-memory DB mock ────────────────────────────────────────────────────────

interface MockRow {
  [key: string]: unknown;
}

type TableStore = Map<string, MockRow>;

const stores: Record<string, TableStore> = {
  'platform.approval_flows': new Map(),
  'platform.approval_requests': new Map(),
  'platform.approval_decisions': new Map(),
};

function resetStores() {
  for (const store of Object.values(stores)) store.clear();
}

let idCounter = 0;
function nextId(): string {
  return `mock-${++idCounter}`;
}

function makePool(): Pool {
  const pool = {
    async query(sql: string, params?: unknown[]): Promise<{ rows: MockRow[] }> {
      return mockQuery(sql, params ?? []);
    },
    async connect(): Promise<PoolClient> {
      return makeClient();
    },
  };
  return pool as unknown as Pool;
}

function makeClient(): PoolClient {
  let inTransaction = false;
  const client = {
    async query(sql: string, params?: unknown[]): Promise<{ rows: MockRow[] }> {
      if (sql === 'BEGIN') { inTransaction = true; return { rows: [] }; }
      if (sql === 'COMMIT') { inTransaction = false; return { rows: [] }; }
      if (sql === 'ROLLBACK') { inTransaction = false; return { rows: [] }; }
      return mockQuery(sql, params ?? []);
    },
    release() { void inTransaction; },
  };
  return client as unknown as PoolClient;
}

function mockQuery(sql: string, params: unknown[]): { rows: MockRow[] } {
  const s = sql.trim().replace(/\s+/g, ' ');

  // ── approval_flows ──
  if (s.startsWith('INSERT INTO platform.approval_flows')) {
    const id = nextId();
    const row: MockRow = {
      id,
      app_id: params[0],
      name: params[1],
      config: typeof params[2] === 'string' ? JSON.parse(params[2]) : params[2],
      created_at: new Date(),
      updated_at: new Date(),
    };
    stores['platform.approval_flows'].set(id, row);
    return { rows: [row] };
  }
  if (s.startsWith('SELECT * FROM platform.approval_flows WHERE id')) {
    const row = stores['platform.approval_flows'].get(params[0] as string);
    return { rows: row ? [row] : [] };
  }
  if (s.startsWith('SELECT * FROM platform.approval_flows WHERE app_id')) {
    const rows = [...stores['platform.approval_flows'].values()].filter(
      (r) => r.app_id === params[0],
    );
    return { rows };
  }
  if (s.startsWith('UPDATE platform.approval_flows')) {
    const id = params[0] as string;
    const row = stores['platform.approval_flows'].get(id);
    if (!row) return { rows: [] };
    const updated = { ...row, name: params[1], config: typeof params[2] === 'string' ? JSON.parse(params[2] as string) : params[2], updated_at: new Date() };
    stores['platform.approval_flows'].set(id, updated);
    return { rows: [updated] };
  }
  if (s.startsWith('DELETE FROM platform.approval_flows')) {
    stores['platform.approval_flows'].delete(params[0] as string);
    return { rows: [] };
  }

  // ── approval_requests ──
  if (s.startsWith('INSERT INTO platform.approval_requests')) {
    const id = nextId();
    const row: MockRow = {
      id,
      flow_id: params[0],
      workflow_run_id: params[1],
      record_id: params[2],
      table_id: params[3],
      current_level: 1,
      status: 'pending',
      config_snapshot: typeof params[4] === 'string' ? JSON.parse(params[4] as string) : params[4],
      created_at: new Date(),
      resolved_at: null,
      timeout_at: params[5] ?? null,
    };
    stores['platform.approval_requests'].set(id, row);
    return { rows: [row] };
  }
  if (s.startsWith('SELECT * FROM platform.approval_requests WHERE id') && s.includes('FOR UPDATE')) {
    const id = params[0] as string;
    const row = stores['platform.approval_requests'].get(id);
    return { rows: row ? [row] : [] };
  }
  if (s.startsWith('SELECT * FROM platform.approval_requests WHERE id')) {
    const id = params[0] as string;
    const row = stores['platform.approval_requests'].get(id);
    return { rows: row ? [row] : [] };
  }
  if (s.startsWith('UPDATE platform.approval_requests')) {
    // Parse column updates from SQL
    const id = params[0] as string;
    const row = stores['platform.approval_requests'].get(id);
    if (!row) return { rows: [] };
    const updated = { ...row };
    if (s.includes('status = \'rejected\'')) {
      updated.status = 'rejected';
      updated.resolved_at = new Date();
    } else if (s.includes('status = \'approved\'')) {
      updated.status = 'approved';
      updated.resolved_at = new Date();
    } else if (s.includes('status = \'timed_out\'')) {
      updated.status = 'timed_out';
      updated.resolved_at = new Date();
    } else if (s.includes('current_level')) {
      updated.current_level = params[1];
      updated.timeout_at = params[2] ?? null;
    }
    stores['platform.approval_requests'].set(id, updated);
    return { rows: [updated] };
  }
  if (s.includes('FROM platform.approval_requests') && s.includes("status = 'pending'") && s.includes('timeout_at')) {
    const now = new Date();
    const rows = [...stores['platform.approval_requests'].values()].filter(
      (r) => r.status === 'pending' && r.timeout_at != null && (r.timeout_at as Date) <= now,
    );
    return { rows };
  }

  // ── approval_decisions ──
  if (s.startsWith('INSERT INTO platform.approval_decisions')) {
    const id = nextId();
    const row: MockRow = {
      id,
      request_id: params[0],
      level: params[1],
      approver_id: params[2],
      decision: params[3],
      comment: params[4] ?? null,
      decided_at: new Date(),
    };
    stores['platform.approval_decisions'].set(id, row);
    return { rows: [row] };
  }
  if (s.startsWith('SELECT * FROM platform.approval_decisions WHERE request_id')) {
    const rows = [...stores['platform.approval_decisions'].values()].filter(
      (r) => r.request_id === params[0],
    );
    return { rows };
  }
  if (s.includes('FROM platform.approval_decisions') && s.includes('GROUP BY decision')) {
    const reqId = params[0];
    const level = params[1];
    const decisions = [...stores['platform.approval_decisions'].values()].filter(
      (r) => r.request_id === reqId && r.level === level,
    );
    const counts: Record<string, number> = {};
    for (const d of decisions) {
      const dec = d.decision as string;
      counts[dec] = (counts[dec] ?? 0) + 1;
    }
    return {
      rows: Object.entries(counts).map(([decision, cnt]) => ({ decision, cnt: String(cnt) })),
    };
  }

  // listPendingApprovals (JOIN query)
  if (s.includes('FROM platform.approval_requests ar') && s.includes("status = 'pending'")) {
    const rows = [...stores['platform.approval_requests'].values()].filter(
      (r) => r.status === 'pending',
    );
    return {
      rows: rows.map((r) => ({
        ...r,
        decisions: [...stores['platform.approval_decisions'].values()].filter(
          (d) => d.request_id === r.id,
        ),
      })),
    };
  }

  return { rows: [] };
}

// ─── Helper factories ─────────────────────────────────────────────────────────

function makeFlow(overrides: Partial<ApprovalFlow> = {}): {
  levels: ApprovalLevel[];
  mode: ApprovalFlowMode;
} {
  return {
    levels: overrides.levels ?? [
      {
        order: 1,
        approverType: 'user',
        approverValue: 'manager1',
        requiredCount: 1,
        onTimeout: 'auto_reject',
      },
    ],
    mode: overrides.parallelOrSequential ?? 'sequential',
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  resetStores();
  idCounter = 0;
});

describe('approvals — createApprovalFlow', () => {
  it('creates a flow and returns it', async () => {
    const pool = makePool();
    const { levels, mode } = makeFlow();
    const flow = await createApprovalFlow(pool, 'app1', 'PO Approval', levels, mode);
    expect(flow.id).toBeDefined();
    expect(flow.name).toBe('PO Approval');
    expect(flow.levels).toHaveLength(1);
    expect(flow.parallelOrSequential).toBe('sequential');
  });
});

describe('approvals — createApprovalRequest', () => {
  it('creates a pending request at level 1', async () => {
    const pool = makePool();
    const { levels, mode } = makeFlow();
    const flow = await createApprovalFlow(pool, 'app1', 'PO', levels, mode);

    const req = await createApprovalRequest(pool, {
      flowId: flow.id,
      workflowRunId: 'run1',
      recordId: 'rec1',
      tableId: 'tbl1',
      configSnapshot: flow,
    });
    expect(req.status).toBe('pending');
    expect(req.currentLevel).toBe(1);
    expect(req.flowId).toBe(flow.id);
  });
});

describe('approvals — decideApproval sequential levels', () => {
  it('advances to level 2 after level 1 is approved in sequential flow', async () => {
    const pool = makePool();
    const levels: ApprovalLevel[] = [
      {
        order: 1,
        approverType: 'user',
        approverValue: 'manager1',
        requiredCount: 1,
        onTimeout: 'auto_reject',
      },
      {
        order: 2,
        approverType: 'user',
        approverValue: 'director1',
        requiredCount: 1,
        onTimeout: 'auto_reject',
      },
    ];
    const flow = await createApprovalFlow(pool, 'app1', 'Multi-level', levels, 'sequential');
    const req = await createApprovalRequest(pool, {
      flowId: flow.id,
      workflowRunId: 'run2',
      recordId: 'rec2',
      tableId: 'tbl1',
      configSnapshot: flow,
    });

    const result = await decideApproval(pool, {
      requestId: req.id,
      approverId: 'manager1',
      approverRoles: [],
      decision: 'approved',
    });

    expect(result.advanced).toBe(true);
    expect(result.resolved).toBe(false);
    expect(result.request.currentLevel).toBe(2);
    expect(result.request.status).toBe('pending');
  });

  it('fully approves when last level approves', async () => {
    const pool = makePool();
    const levels: ApprovalLevel[] = [
      {
        order: 1,
        approverType: 'user',
        approverValue: 'manager1',
        requiredCount: 1,
        onTimeout: 'auto_reject',
      },
    ];
    const flow = await createApprovalFlow(pool, 'app1', 'Single-level', levels, 'sequential');
    const req = await createApprovalRequest(pool, {
      flowId: flow.id,
      workflowRunId: 'run3',
      recordId: 'rec3',
      tableId: 'tbl1',
      configSnapshot: flow,
    });

    const result = await decideApproval(pool, {
      requestId: req.id,
      approverId: 'manager1',
      approverRoles: [],
      decision: 'approved',
    });

    expect(result.resolved).toBe(true);
    expect(result.finalStatus).toBe('approved');
  });

  it('rejects immediately on rejection at any level', async () => {
    const pool = makePool();
    const levels: ApprovalLevel[] = [
      {
        order: 1,
        approverType: 'user',
        approverValue: 'manager1',
        requiredCount: 1,
        onTimeout: 'auto_reject',
      },
    ];
    const flow = await createApprovalFlow(pool, 'app1', 'Reject test', levels, 'sequential');
    const req = await createApprovalRequest(pool, {
      flowId: flow.id,
      workflowRunId: 'run4',
      recordId: 'rec4',
      tableId: 'tbl1',
      configSnapshot: flow,
    });

    const result = await decideApproval(pool, {
      requestId: req.id,
      approverId: 'manager1',
      approverRoles: [],
      decision: 'rejected',
      comment: 'Not approved',
    });

    expect(result.resolved).toBe(true);
    expect(result.finalStatus).toBe('rejected');
  });
});

describe('approvals — error cases', () => {
  it('throws ApprovalNotFoundError for unknown request', async () => {
    const pool = makePool();
    await expect(
      decideApproval(pool, {
        requestId: 'nonexistent',
        approverId: 'u1',
        approverRoles: [],
        decision: 'approved',
      }),
    ).rejects.toBeInstanceOf(ApprovalNotFoundError);
  });

  it('throws ApprovalAlreadyDecidedError when request is already resolved', async () => {
    const pool = makePool();
    const { levels, mode } = makeFlow();
    const flow = await createApprovalFlow(pool, 'app1', 'F', levels, mode);
    const req = await createApprovalRequest(pool, {
      flowId: flow.id,
      workflowRunId: 'run5',
      recordId: 'rec5',
      tableId: 'tbl1',
      configSnapshot: flow,
    });

    await decideApproval(pool, {
      requestId: req.id,
      approverId: 'manager1',
      approverRoles: [],
      decision: 'approved',
    });

    // Try to decide again on the same request
    await expect(
      decideApproval(pool, {
        requestId: req.id,
        approverId: 'manager1',
        approverRoles: [],
        decision: 'rejected',
      }),
    ).rejects.toBeInstanceOf(ApprovalAlreadyDecidedError);
  });

  it('throws ApprovalUnauthorizedError when user is not the approver', async () => {
    const pool = makePool();
    const { levels, mode } = makeFlow(); // approverValue = 'manager1'
    const flow = await createApprovalFlow(pool, 'app1', 'F', levels, mode);
    const req = await createApprovalRequest(pool, {
      flowId: flow.id,
      workflowRunId: 'run6',
      recordId: 'rec6',
      tableId: 'tbl1',
      configSnapshot: flow,
    });

    await expect(
      decideApproval(pool, {
        requestId: req.id,
        approverId: 'other_user',
        approverRoles: [],
        decision: 'approved',
      }),
    ).rejects.toBeInstanceOf(ApprovalUnauthorizedError);
  });
});

describe('approvals — processTimedOutApprovals (escalation)', () => {
  it('escalates to next level on timeout with escalate_to_next policy', async () => {
    const pool = makePool();
    const levels: ApprovalLevel[] = [
      {
        order: 1,
        approverType: 'user',
        approverValue: 'manager1',
        requiredCount: 1,
        timeoutHours: 0,
        onTimeout: 'escalate_to_next',
      },
      {
        order: 2,
        approverType: 'user',
        approverValue: 'director1',
        requiredCount: 1,
        onTimeout: 'auto_reject',
      },
    ];
    const flow = await createApprovalFlow(pool, 'app1', 'Escalation', levels, 'sequential');

    // Create a request with timeout_at in the past
    const req = await createApprovalRequest(pool, {
      flowId: flow.id,
      workflowRunId: 'run7',
      recordId: 'rec7',
      tableId: 'tbl1',
      configSnapshot: flow,
    });

    // Directly manipulate store to set timeout in past
    const stored = stores['platform.approval_requests'].get(req.id);
    if (stored) {
      stored.timeout_at = new Date(Date.now() - 1000); // 1 second ago
    }

    const count = await processTimedOutApprovals(pool);
    expect(count).toBeGreaterThanOrEqual(1);

    // The request should now be at level 2
    const updatedRow = stores['platform.approval_requests'].get(req.id);
    expect(updatedRow?.current_level).toBe(2);
    expect(updatedRow?.status).toBe('pending');
  });

  it('auto-rejects on timeout with auto_reject policy', async () => {
    const pool = makePool();
    const levels: ApprovalLevel[] = [
      {
        order: 1,
        approverType: 'user',
        approverValue: 'manager1',
        requiredCount: 1,
        timeoutHours: 1,
        onTimeout: 'auto_reject',
      },
    ];
    const flow = await createApprovalFlow(pool, 'app1', 'AutoReject', levels, 'sequential');
    const req = await createApprovalRequest(pool, {
      flowId: flow.id,
      workflowRunId: 'run8',
      recordId: 'rec8',
      tableId: 'tbl1',
      configSnapshot: flow,
    });

    // Set timeout to past
    const stored = stores['platform.approval_requests'].get(req.id);
    if (stored) stored.timeout_at = new Date(Date.now() - 1000);

    await processTimedOutApprovals(pool);

    const updatedRow = stores['platform.approval_requests'].get(req.id);
    expect(updatedRow?.status).toBe('rejected');
  });
});
