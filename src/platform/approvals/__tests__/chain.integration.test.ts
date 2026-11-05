/**
 * Integration tests for the approvals chain.
 * Skipped when TEST_DATABASE_URL is not set.
 */

import { Pool } from 'pg';
import { ApprovalChainDef } from '../../contracts/rules';
import { startApproval, processDecision, getApprovalInbox } from '../chain';

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
const describeIfDb = TEST_DATABASE_URL ? describe : describe.skip;

describeIfDb('approvals integration', () => {
  let pool: Pool;
  const tenantSlug = `test_${Date.now()}`;

  beforeAll(async () => {
    pool = new Pool({ connectionString: TEST_DATABASE_URL });

    // Run migration inline
    await pool.query(`
      CREATE TABLE IF NOT EXISTS public.approval_requests (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        chain_id TEXT NOT NULL,
        table_id TEXT NOT NULL,
        record_id TEXT NOT NULL,
        tenant_slug TEXT NOT NULL,
        current_level INT NOT NULL DEFAULT 1,
        status TEXT NOT NULL DEFAULT 'pending'
          CHECK (status IN ('pending','approved','rejected','escalated','delegated')),
        amount_value NUMERIC,
        requested_by TEXT NOT NULL,
        requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        decided_at TIMESTAMPTZ,
        decided_by TEXT,
        comments TEXT,
        delegated_to TEXT
      );
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS public.approval_level_decisions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        request_id UUID NOT NULL REFERENCES public.approval_requests(id) ON DELETE CASCADE,
        level INT NOT NULL,
        approver_id TEXT NOT NULL,
        action TEXT NOT NULL CHECK (action IN ('approve','reject','delegate')),
        decided_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        comments TEXT
      );
    `);
  });

  afterAll(async () => {
    // Clean up test data
    await pool.query(
      `DELETE FROM public.approval_requests WHERE tenant_slug = $1`,
      [tenantSlug],
    );
    await pool.end();
  });

  function makeChain(): ApprovalChainDef {
    return {
      id: `chain-integration-${Date.now()}`,
      appId: 'app-test',
      name: 'Integration Test Chain',
      tableId: 'tbl-test',
      levels: [
        {
          rank: 1,
          approverType: 'user',
          userId: 'user-manager',
          mode: 'sequential',
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
    };
  }

  it('full approve flow: level 1 → level 2 → approved', async () => {
    const chain = makeChain();

    const req = await startApproval(pool, tenantSlug, chain, 'rec-int-1', 'user-requester');
    expect(req.status).toBe('pending');
    expect(req.currentLevel).toBe(1);

    const afterLevel1 = await processDecision(
      pool,
      tenantSlug,
      { requestId: req.id, decidedBy: 'user-manager', action: 'approve' },
      chain,
      [],
    );
    expect(afterLevel1.currentLevel).toBe(2);
    expect(afterLevel1.status).toBe('pending');

    const afterLevel2 = await processDecision(
      pool,
      tenantSlug,
      { requestId: req.id, decidedBy: 'user-director', action: 'approve' },
      chain,
      ['role-director'],
    );
    expect(afterLevel2.status).toBe('approved');
  });

  it('full reject flow: reject at level 1 → rejected', async () => {
    const chain = makeChain();

    const req = await startApproval(pool, tenantSlug, chain, 'rec-int-2', 'user-requester');

    const afterReject = await processDecision(
      pool,
      tenantSlug,
      { requestId: req.id, decidedBy: 'user-manager', action: 'reject', comments: 'Not justified' },
      chain,
      [],
    );
    expect(afterReject.status).toBe('rejected');
    expect(afterReject.comments).toBe('Not justified');
  });

  it('inbox returns correct pending requests for a given user+roles', async () => {
    const chain = makeChain();

    // Create two requests
    const req1 = await startApproval(pool, tenantSlug, chain, 'rec-int-3', 'user-requester');
    const req2 = await startApproval(pool, tenantSlug, chain, 'rec-int-4', 'user-requester');

    // user-manager should see both (level 1)
    const managerInbox = await getApprovalInbox(pool, tenantSlug, 'user-manager', [], [chain]);
    const managerIds = managerInbox.map((r) => r.id);
    expect(managerIds).toContain(req1.id);
    expect(managerIds).toContain(req2.id);

    // role-director should see none (they're at level 1 still)
    const directorInbox = await getApprovalInbox(pool, tenantSlug, 'user-director', ['role-director'], [chain]);
    const directorIds = directorInbox.map((r) => r.id);
    expect(directorIds).not.toContain(req1.id);

    // Advance req1 to level 2
    await processDecision(
      pool,
      tenantSlug,
      { requestId: req1.id, decidedBy: 'user-manager', action: 'approve' },
      chain,
      [],
    );

    // Now director should see req1
    const directorInbox2 = await getApprovalInbox(pool, tenantSlug, 'user-director', ['role-director'], [chain]);
    const directorIds2 = directorInbox2.map((r) => r.id);
    expect(directorIds2).toContain(req1.id);
    expect(directorIds2).not.toContain(req2.id);
  });
});
