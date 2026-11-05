/**
 * Integration tests for the fulfilment linker (real Postgres).
 *
 * Skipped automatically when TEST_DATABASE_URL is not set.
 */

import { Pool } from 'pg';
import { createLink, getFulfilmentStatus, getLinkedTargets, syncFulfilmentStatus } from '../linker';
import type { FulfilmentEngineConfig } from '@/platform/contracts';

const TEST_DB = process.env['TEST_DATABASE_URL'];
const describeIfDb = TEST_DB ? describe : describe.skip;

describeIfDb('linker integration', () => {
  let pool: Pool;

  beforeAll(async () => {
    pool = new Pool({ connectionString: TEST_DB });

    // Create the fulfilment_links table if it does not exist
    await pool.query(`
      CREATE TABLE IF NOT EXISTS public.fulfilment_links (
        id                     UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_slug            TEXT        NOT NULL,
        source_line_table_id   TEXT        NOT NULL,
        source_line_record_id  TEXT        NOT NULL,
        target_line_table_id   TEXT        NOT NULL,
        target_line_record_id  TEXT        NOT NULL,
        qty_linked             NUMERIC     NOT NULL CHECK (qty_linked > 0),
        created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
        created_by             TEXT        NOT NULL
      )
    `);
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM public.fulfilment_links WHERE tenant_slug = 'integ-test'`);
    await pool.end();
  });

  const tenantSlug = 'integ-test';
  const config: FulfilmentEngineConfig = {
    enabled: true,
    sourceTableId: 'indent',
    sourceLineTableId: 'indent_line',
    targetLineTableId: 'po_line',
    qtyOrderedFieldId: 'qty_ordered',
    qtyReceivedFieldId: 'qty_received',
    statusFieldId: 'status',
  };

  it('creates a link and reads it back', async () => {
    const link = await createLink(pool, tenantSlug, {
      tenantSlug,
      config,
      sourceLineTableId: 'indent_line',
      sourceLineRecordId: 'sl-001',
      targetLineTableId: 'po_line',
      targetLineRecordId: 'tl-001',
      qtyLinked: 5,
      createdBy: 'user-1',
    });

    expect(link.id).toBeTruthy();
    expect(link.qtyLinked).toBe(5);

    const targets = await getLinkedTargets(pool, tenantSlug, 'indent_line', 'sl-001');
    expect(targets.length).toBeGreaterThanOrEqual(1);
    expect(targets[0].targetLineRecordId).toBe('tl-001');
  });

  it('status = partial after creating one partial link', async () => {
    const status = await getFulfilmentStatus(pool, tenantSlug, 'indent_line', 'sl-001', 10);
    expect(status.status).toBe('partial');
    expect(status.qtyLinked).toBe(5);
    expect(status.qtyPending).toBe(5);
  });

  it('status = fulfilled after fulfilling remaining qty', async () => {
    await createLink(pool, tenantSlug, {
      tenantSlug,
      config,
      sourceLineTableId: 'indent_line',
      sourceLineRecordId: 'sl-001',
      targetLineTableId: 'po_line',
      targetLineRecordId: 'tl-002',
      qtyLinked: 5,
      createdBy: 'user-1',
    });

    const status = await getFulfilmentStatus(pool, tenantSlug, 'indent_line', 'sl-001', 10);
    expect(status.status).toBe('fulfilled');
    expect(status.qtyPending).toBe(0);
  });

  it('syncFulfilmentStatus skips gracefully when config.enabled = false', async () => {
    const disabledConfig: FulfilmentEngineConfig = { ...config, enabled: false };
    // Should not throw
    await expect(
      syncFulfilmentStatus(pool, tenantSlug, disabledConfig, 'rec-999'),
    ).resolves.toBeUndefined();
  });
});
