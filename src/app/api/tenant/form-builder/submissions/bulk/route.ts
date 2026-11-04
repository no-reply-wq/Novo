/**
 * Bulk Submission Actions
 * POST — bulk delete or bulk export (CSV) selected submissions
 */

import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/tenant-session';
import { MODULE } from '@/lib/auth/modules';
import { tenantQuery } from '@/lib/db/client';
import { z } from 'zod';
import { writeAudit } from '@/lib/audit';

const BulkSchema = z.object({
  action: z.enum(['delete', 'export']),
  ids: z.array(z.string()).min(1).max(500),
});

export async function POST(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tenantSlug = searchParams.get('tenant');
  if (!tenantSlug) return NextResponse.json({ error: 'Missing tenant' }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const parsed = BulkSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });

  const { action, ids } = parsed.data;

  if (action === 'delete') {
    const ctx = await requirePermission(tenantSlug, MODULE.FORM_BUILDER, 'delete');
    if (ctx instanceof NextResponse) return ctx;

    // Build parameterized placeholders: $1, $2, ...
    const placeholders = ids.map((_, i) => `$${i + 1}`).join(', ');
    const result = await tenantQuery(
      ctx.schemaName,
      `DELETE FROM form_submissions WHERE id IN (${placeholders})`,
      ids
    );
    const count = result.rowCount ?? 0;

    writeAudit(ctx.schemaName, ctx.tenantUserId, 'delete', 'form_submission', 'bulk', {
      ids,
      count,
    }).catch(() => {});

    return NextResponse.json({ success: true, deleted: count });
  }

  if (action === 'export') {
    const ctx = await requirePermission(tenantSlug, MODULE.FORM_BUILDER, 'view');
    if (ctx instanceof NextResponse) return ctx;

    const placeholders = ids.map((_, i) => `$${i + 1}`).join(', ');
    const rows = await tenantQuery<{
      id: string;
      form_id: string;
      header_data: Record<string, unknown>;
      submitted_at: string;
      revision_number: number;
      submitted_by_name: string;
    }>(
      ctx.schemaName,
      `SELECT fs.id, fs.form_id, fs.header_data, fs.submitted_at,
              fs.revision_number, u.name as submitted_by_name
       FROM form_submissions fs
       LEFT JOIN users u ON u.id = fs.submitted_by
       WHERE fs.id IN (${placeholders})
       ORDER BY fs.submitted_at DESC`,
      ids
    );

    if (!rows.rows.length) {
      return NextResponse.json({ error: 'No submissions found' }, { status: 404 });
    }

    // Build CSV
    // Collect all header_data keys across all rows for consistent columns
    const allKeys = new Set<string>();
    for (const r of rows.rows) {
      if (r.header_data && typeof r.header_data === 'object') {
        for (const k of Object.keys(r.header_data)) allKeys.add(k);
      }
    }
    const dataKeys = [...allKeys];

    const csvLines: string[] = [];
    // Header row
    const headerRow = ['id', 'submitted_at', 'revision', 'submitted_by', ...dataKeys]
      .map(k => `"${k}"`)
      .join(',');
    csvLines.push(headerRow);

    // Data rows
    for (const row of rows.rows) {
      const vals = [
        row.id,
        row.submitted_at,
        row.revision_number,
        row.submitted_by_name ?? '',
        ...dataKeys.map(k => {
          const v = row.header_data?.[k];
          if (v === null || v === undefined) return '';
          return typeof v === 'object' ? JSON.stringify(v) : String(v);
        }),
      ].map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',');
      csvLines.push(vals);
    }

    const csv = csvLines.join('\r\n');

    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="submissions-${Date.now()}.csv"`,
      },
    });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
