/**
 * POST /api/tenant/form-builder/submissions/[submissionId]/revise
 *
 * Creates a new revision of a submission instead of overwriting it in
 * place: the old row keeps its data and is marked is_latest = false,
 * a brand-new row is inserted with the same thread_id and
 * revision_number + 1, carrying the new header/line-item data.
 * Everything reading submissions normally (the browse list, the board
 * view) only ever sees the latest revision per thread — older ones
 * stay queryable via the thread history endpoint but don't clutter
 * the everyday view.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/tenant-session';
import { tenantQuery, withTenantTransaction } from '@/lib/db/client';
import { z } from 'zod';
import { v4 as uuid } from 'uuid';

const ReviseSchema = z.object({
  headerData: z.record(z.string(), z.unknown()),
  lineItems: z.array(z.record(z.string(), z.unknown())).default([]),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ submissionId: string }> }
) {
  const { searchParams } = new URL(req.url);
  const tenantSlug = searchParams.get('tenant');
  if (!tenantSlug) return NextResponse.json({ error: 'Missing tenant' }, { status: 400 });

  const ctx = await requirePermission(tenantSlug, 'form_builder', 'edit');
  if (ctx instanceof NextResponse) return ctx;

  const { submissionId } = await params;
  const body = await req.json().catch(() => ({}));
  const parsed = ReviseSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });

  const existing = await tenantQuery<{ form_id: string; is_test: boolean; thread_id: string; revision_number: number; submitted_by: string }>(
    ctx.schemaName,
    `SELECT form_id, is_test, thread_id, revision_number, submitted_by FROM form_submissions WHERE id = $1`,
    [submissionId]
  );
  if (existing.rows.length === 0) return NextResponse.json({ error: 'Submission not found' }, { status: 404 });
  const original = existing.rows[0];
  const threadId = original.thread_id ?? submissionId; // backfill safety, in case migration hasn't run yet

  const newId = await withTenantTransaction(ctx.schemaName, async (client) => {
    await client.query(`UPDATE form_submissions SET is_latest = false WHERE id = $1`, [submissionId]);

    const id = uuid();
    await client.query(
      `INSERT INTO form_submissions
         (id, form_id, is_test, header_data, submitted_by, thread_id, revision_number, is_latest)
       VALUES ($1, $2, $3, $4, $5, $6, $7, true)`,
      [id, original.form_id, original.is_test, JSON.stringify(parsed.data.headerData), ctx.userId, threadId, original.revision_number + 1]
    );

    for (let i = 0; i < parsed.data.lineItems.length; i++) {
      await client.query(
        `INSERT INTO form_submission_items (id, submission_id, row_index, item_data)
         VALUES ($1, $2, $3, $4)`,
        [uuid(), id, i, JSON.stringify(parsed.data.lineItems[i])]
      );
    }

    return id;
  });

  const result = await tenantQuery(ctx.schemaName, `SELECT * FROM form_submissions WHERE id = $1`, [newId]);
  return NextResponse.json({ submission: result.rows[0] }, { status: 201 });
}
