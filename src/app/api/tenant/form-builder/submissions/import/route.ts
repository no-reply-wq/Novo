import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/tenant-session';
import { tenantQuery } from '@/lib/db/client';
import { MODULE } from '@/lib/auth/modules';

export async function POST(req: NextRequest) {
  try {
    const tenantSlug = req.nextUrl.searchParams.get('tenant') ?? '';
    const ctx = await requirePermission(tenantSlug, MODULE.FORM_BUILDER, 'create');
    if (ctx instanceof NextResponse) return ctx;
    const schemaName = ctx.schemaName;
    const session = ctx;

    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const formId = formData.get('formId') as string | null;

    if (!file || !formId) {
      return NextResponse.json({ error: 'file and formId required' }, { status: 400 });
    }

    const text = await file.text();
    const lines = text.split('\n').filter(l => l.trim());
    if (lines.length < 2) return NextResponse.json({ error: 'CSV must have header + data rows' }, { status: 400 });

    // Parse CSV (simple, no quoted commas)
    const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
    const rows = lines.slice(1).map(line => {
      const values = line.split(',').map(v => v.trim().replace(/^"|"$/g, ''));
      return Object.fromEntries(headers.map((h, i) => [h, values[i] ?? '']));
    });

    // Get form info
    const formResult = await tenantQuery(schemaName, `
      SELECT id, slug, has_backing_table FROM "${schemaName}".form_configs WHERE id = $1
    `, [formId]);
    if (formResult.rows.length === 0) return NextResponse.json({ error: 'Form not found' }, { status: 404 });
    const form = formResult.rows[0];

    let imported = 0;
    const errors: string[] = [];

    for (let i = 0; i < rows.length; i++) {
      try {
        const headerData = rows[i];
        const result = await tenantQuery(schemaName, `
          INSERT INTO "${schemaName}".form_submissions
            (form_id, header_data, submitted_by, is_latest, is_test, revision_number)
          VALUES ($1, $2::jsonb, $3, true, false, 1)
          RETURNING id, thread_id
        `, [formId, JSON.stringify(headerData), session.userId]);

        imported++;
      } catch (e) {
        errors.push(`Row ${i + 2}: ${e instanceof Error ? e.message : 'unknown error'}`);
      }
    }

    return NextResponse.json({ imported, errors, total: rows.length });
  } catch (e) {
    console.error('CSV import error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
