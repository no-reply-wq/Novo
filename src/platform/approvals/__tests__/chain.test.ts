/**
 * Unit tests for the approvals chain executor.
 * No real Postgres required — uses an in-memory mock pool.
 */

import { Pool, PoolClient, QueryResult } from 'pg';
import { ApprovalChainDef } from '../../contracts/rules';
import {
  startApproval,
  processDecision,
  getApprovalInbox,
} from '../chain';
import {
  ApprovalNotFoundError,
  ApprovalUnauthorizedError,
  ApprovalAlreadyDecidedError,
} from '../errors';

// ─── Mock pool factory ────────────────────────────────────────────────────────

/**
 * Creates a minimal mock pool that plays back canned query results in order.
 */
function makeMockPool(queryResults: QueryResult[]): Pool {
  let callIndex = 0;

  const mockClient: Partial<PoolClient> = {
    query: jest.fn(async (_sql: unknown, _params?: unknown[]): Promise<QueryResult> => {
      // BEGIN / COMMIT / ROLLBACK return empty results
      if (typeof _sql === 'string') {
        const upper = _sql.trim().toUpperCase();
        if (upper === 'BEGIN' || upper === 'COMMIT' || upper === 'ROLLBACK') {
          return { rows: [], rowCount: 0, command: upper, oid: 0, fields: [] };
        }
      }
      const result = queryResults[callIndex++];
      if (!result) {
        throw new Error(`Unexpected query call #${callIndex} — no more canned results`);
      }
      return result;
    }),
    release: jest.fn(),
  };

  const mockPool: Partial<Pool> = {
    connect: jest.fn(async () => mockClient as PoolClient),
  };

  return mockPool as Pool;
}

function makeRow(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    id: 'req-1',
    chain_id: 'chain-1',
    table_id: 'tbl-orders',
    record_id: 'rec-1',
    tenant_slug: 'acme',
    current_level: 1,
    status: 'pending',
    amount_value: null,
    requested_by: 'user-requester',
    requested_at: new Date('2024-01-01T00:00:00Z'),
    decided_at: null,
    decided_by: null,
    comments: null,
    delegated_to: null,
    ...overrides,
  };
}

function qr(rows: Record<string, unknown>[]): QueryResult {
  return { rows, rowCount: rows.length, command: 'SELECT', oid: 0, fields: [] };
}

// ─── Chain definitions ────────────────────────────────────────────────────────

function makeChain(overrides: Partial<ApprovalChainDef> = {}): ApprovalChainDef {
  return {
    id: 'chain-1',
    appId: 'app-1',
    name: 'Test Chain',
    tableId: 'tbl-orders',
    levels: [
      {
        rank: 1,
        approverType: 'user',
        userId: 'user-manager',
        mode: 'sequential',
        allowDelegation: true,
      },
      {
        rank: 2,
        approverType: 'role',
        roleId: 'role-director',
        mode: 'sequential',
      },
    ],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

// ─── startApproval ───────────────────────────────────────────────────────────

describe('startApproval', () => {
  it('inserts a request and returns it', async () => {
    const chain = makeChain();
    const insertedRow = makeRow({ current_level: 1 });
    const pool = makeMockPool([qr([insertedRow])]);

    const req = await startApproval(pool, 'acme', chain, 'rec-1', 'user-requester');

    expect(req.id).toBe('req-1');
    expect(req.currentLevel).toBe(1);
    expect(req.status).toBe('pending');
  });

  it('routes to level 1 when amount falls in first range', async () => {
    const chain = makeChain({
      levels: [
        {
          rank: 1,
          approverType: 'user',
          userId: 'user-manager',
          mode: 'sequential',
          amountMin: 0,
          amountMax: 1000,
        },
        {
          rank: 2,
          approverType: 'role',
          roleId: 'role-director',
          mode: 'sequential',
          amountMin: 1001,
          amountMax: 50000,
        },
      ],
    });

    const insertedRow = makeRow({ current_level: 1 });
    const pool = makeMockPool([qr([insertedRow])]);

    const req = await startApproval(pool, 'acme', chain, 'rec-1', 'user-requester', 500);
    expect(req.currentLevel).toBe(1);
  });

  it('routes to level 2 when amount falls in second range', async () => {
    const chain = makeChain({
      levels: [
        {
          rank: 1,
          approverType: 'user',
          userId: 'user-manager',
          mode: 'sequential',
          amountMin: 0,
          amountMax: 1000,
        },
        {
          rank: 2,
          approverType: 'role',
          roleId: 'role-director',
          mode: 'sequential',
          amountMin: 1001,
          amountMax: 50000,
        },
      ],
    });

    const insertedRow = makeRow({ current_level: 2 });
    const pool = makeMockPool([qr([insertedRow])]);

    const req = await startApproval(pool, 'acme', chain, 'rec-1', 'user-requester', 5000);
    expect(req.currentLevel).toBe(2);
  });
});

// ─── processDecision — sequential ────────────────────────────────────────────

describe('processDecision (sequential)', () => {
  it('approve level 1 → advances to level 2', async () => {
    const chain = makeChain();

    const loadedRow = makeRow({ current_level: 1, status: 'pending' });
    // per-approver decision insert
    const insertDecisionRow = makeRow({ id: 'dec-1' });
    // advance to level 2
    const advancedRow = makeRow({ current_level: 2, status: 'pending' });

    const pool = makeMockPool([
      qr([loadedRow]),        // SELECT … FOR UPDATE
      qr([insertDecisionRow]), // INSERT level_decisions
      qr([advancedRow]),       // UPDATE advance level
    ]);

    const req = await processDecision(
      pool,
      'acme',
      { requestId: 'req-1', decidedBy: 'user-manager', action: 'approve' },
      chain,
      [],
    );

    expect(req.currentLevel).toBe(2);
    expect(req.status).toBe('pending');
  });

  it('approve final level → status becomes approved', async () => {
    const chain = makeChain();

    // Request already at level 2 (final)
    const loadedRow = makeRow({ current_level: 2, status: 'pending' });
    const insertDecisionRow = makeRow({ id: 'dec-1' });
    const approvedRow = makeRow({ current_level: 2, status: 'approved', decided_by: 'user-director' });

    const pool = makeMockPool([
      qr([loadedRow]),
      qr([insertDecisionRow]),
      qr([approvedRow]),
    ]);

    const req = await processDecision(
      pool,
      'acme',
      { requestId: 'req-1', decidedBy: 'user-director', action: 'approve' },
      chain,
      ['role-director'],
    );

    expect(req.status).toBe('approved');
  });

  it('reject at any level → status becomes rejected', async () => {
    const chain = makeChain();

    const loadedRow = makeRow({ current_level: 1, status: 'pending' });
    const insertDecisionRow = makeRow({ id: 'dec-1' });
    const rejectedRow = makeRow({ status: 'rejected', decided_by: 'user-manager' });

    const pool = makeMockPool([
      qr([loadedRow]),
      qr([insertDecisionRow]),
      qr([rejectedRow]),
    ]);

    const req = await processDecision(
      pool,
      'acme',
      { requestId: 'req-1', decidedBy: 'user-manager', action: 'reject' },
      chain,
      [],
    );

    expect(req.status).toBe('rejected');
  });

  it('delegate → delegatedTo is set', async () => {
    const chain = makeChain();

    const loadedRow = makeRow({ current_level: 1, status: 'pending' });
    const insertDecisionRow = makeRow({ id: 'dec-1' });
    const delegatedRow = makeRow({
      status: 'delegated',
      delegated_to: 'user-delegate',
    });

    const pool = makeMockPool([
      qr([loadedRow]),
      qr([insertDecisionRow]),
      qr([delegatedRow]),
    ]);

    const req = await processDecision(
      pool,
      'acme',
      {
        requestId: 'req-1',
        decidedBy: 'user-manager',
        action: 'delegate',
        delegateTo: 'user-delegate',
      },
      chain,
      [],
    );

    expect(req.status).toBe('delegated');
    expect(req.delegatedTo).toBe('user-delegate');
  });

  it('throws ApprovalAlreadyDecidedError when request is already approved', async () => {
    const chain = makeChain();
    const loadedRow = makeRow({ status: 'approved' });

    const pool = makeMockPool([qr([loadedRow])]);

    await expect(
      processDecision(
        pool,
        'acme',
        { requestId: 'req-1', decidedBy: 'user-manager', action: 'approve' },
        chain,
        [],
      ),
    ).rejects.toThrow(ApprovalAlreadyDecidedError);
  });

  it('throws ApprovalNotFoundError when request does not exist', async () => {
    const chain = makeChain();

    const pool = makeMockPool([qr([])]);

    await expect(
      processDecision(
        pool,
        'acme',
        { requestId: 'req-missing', decidedBy: 'user-manager', action: 'approve' },
        chain,
        [],
      ),
    ).rejects.toThrow(ApprovalNotFoundError);
  });

  it('throws ApprovalUnauthorizedError when user lacks role', async () => {
    const chain = makeChain({
      levels: [
        {
          rank: 1,
          approverType: 'role',
          roleId: 'role-manager',
          mode: 'sequential',
        },
      ],
    });

    const loadedRow = makeRow({ current_level: 1, status: 'pending' });
    const pool = makeMockPool([qr([loadedRow])]);

    await expect(
      processDecision(
        pool,
        'acme',
        { requestId: 'req-1', decidedBy: 'user-clerk', action: 'approve' },
        chain,
        ['role-clerk'],
      ),
    ).rejects.toThrow(ApprovalUnauthorizedError);
  });
});

// ─── processDecision — parallel ──────────────────────────────────────────────

describe('processDecision (parallel)', () => {
  function makeParallelChain(): ApprovalChainDef {
    return {
      id: 'chain-parallel',
      appId: 'app-1',
      name: 'Parallel Chain',
      tableId: 'tbl-orders',
      levels: [
        {
          rank: 1,
          approverType: 'user',
          userId: 'user-a',
          mode: 'parallel',
        },
      ],
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  it('parallel with 1 required approver: approve → becomes approved', async () => {
    const chain = makeParallelChain();

    const loadedRow = makeRow({ chain_id: 'chain-parallel', current_level: 1, status: 'pending' });
    const insertDecisionRow = makeRow({ id: 'dec-1' });
    // reject check: 0 rejects
    const rejectCheckRow = { count: '0' };
    // approve count: 1 approval
    const approveCountRow = { count: '1' };
    const approvedRow = makeRow({ chain_id: 'chain-parallel', status: 'approved', decided_by: 'user-a' });

    const pool = makeMockPool([
      qr([loadedRow]),
      qr([insertDecisionRow]),
      qr([rejectCheckRow as unknown as Record<string, unknown>]),
      qr([approveCountRow as unknown as Record<string, unknown>]),
      qr([approvedRow]),
    ]);

    const req = await processDecision(
      pool,
      'acme',
      { requestId: 'req-1', decidedBy: 'user-a', action: 'approve' },
      chain,
      [],
    );

    expect(req.status).toBe('approved');
  });

  it('parallel reject → immediately rejected', async () => {
    const chain = makeParallelChain();

    const loadedRow = makeRow({ chain_id: 'chain-parallel', current_level: 1, status: 'pending' });
    const insertDecisionRow = makeRow({ id: 'dec-1' });
    const rejectedRow = makeRow({ chain_id: 'chain-parallel', status: 'rejected', decided_by: 'user-a' });

    const pool = makeMockPool([
      qr([loadedRow]),
      qr([insertDecisionRow]),
      qr([rejectedRow]),
    ]);

    const req = await processDecision(
      pool,
      'acme',
      { requestId: 'req-1', decidedBy: 'user-a', action: 'reject' },
      chain,
      [],
    );

    expect(req.status).toBe('rejected');
  });
});

// ─── getApprovalInbox ─────────────────────────────────────────────────────────

describe('getApprovalInbox', () => {
  it('returns pending requests for user-type approver', async () => {
    const chain = makeChain();

    const rows = [
      makeRow({ chain_id: 'chain-1', current_level: 1, status: 'pending' }),
    ];
    const pool = makeMockPool([qr(rows)]);

    const inbox = await getApprovalInbox(pool, 'acme', 'user-manager', [], [chain]);

    expect(inbox).toHaveLength(1);
    expect(inbox[0].id).toBe('req-1');
  });

  it('filters out requests where user is not the approver', async () => {
    const chain = makeChain();

    const rows = [
      makeRow({ chain_id: 'chain-1', current_level: 1, status: 'pending' }),
    ];
    const pool = makeMockPool([qr(rows)]);

    const inbox = await getApprovalInbox(pool, 'acme', 'user-not-approver', [], [chain]);

    expect(inbox).toHaveLength(0);
  });

  it('returns requests at level 2 for the correct role', async () => {
    const chain = makeChain();

    const rows = [
      makeRow({ chain_id: 'chain-1', current_level: 2, status: 'pending' }),
    ];
    const pool = makeMockPool([qr(rows)]);

    const inbox = await getApprovalInbox(pool, 'acme', 'user-director', ['role-director'], [chain]);

    expect(inbox).toHaveLength(1);
  });

  it('returns delegated requests only to the delegatee', async () => {
    const chain = makeChain();

    const rows = [
      makeRow({ chain_id: 'chain-1', current_level: 1, status: 'delegated', delegated_to: 'user-delegate' }),
    ];
    const pool = makeMockPool([qr(rows)]);

    const inboxDelegate = await getApprovalInbox(pool, 'acme', 'user-delegate', [], [chain]);
    expect(inboxDelegate).toHaveLength(1);
  });
});
