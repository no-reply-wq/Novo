/**
 * PDF Document API
 * POST /api/documents/pdf
 * { templateId, recordId }
 * → streams PDF binary with Content-Type: application/pdf
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { pgPool } from '@/lib/db/client';
import { z } from 'zod';
import { renderPdf } from '@/platform/documents/renderer';
import type { PdfTemplate } from '@/platform/documents/types';

const RequestSchema = z.object({
  templateId: z.string().uuid(),
  recordId: z.string().min(1),
});

interface TemplateRow {
  id: string;
  tenant_slug: string;
  name: string;
  table_id: string;
  config: PdfTemplate;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const tenantSlug =
    (session.user as { tenantSlug?: string }).tenantSlug ?? '';
  if (!tenantSlug) {
    return NextResponse.json({ error: 'No tenant in session' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({})) as unknown;
  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });
  }

  const { templateId, recordId } = parsed.data;

  // Load template — scoped to tenant
  const tplRes = await pgPool.query<TemplateRow>(
    `SELECT id, tenant_slug, name, table_id, config
     FROM platform.pdf_templates
     WHERE id = $1 AND tenant_slug = $2`,
    [templateId, tenantSlug],
  );

  if (tplRes.rowCount === 0) {
    return NextResponse.json({ error: 'Template not found' }, { status: 404 });
  }

  const tplRow = tplRes.rows[0];
  const template: PdfTemplate = {
    ...tplRow.config,
    id: tplRow.id,
    tenantSlug: tplRow.tenant_slug,
    name: tplRow.name,
    tableId: tplRow.table_id,
  };

  // Load the main record from the tenant schema
  const schema = `tenant_${tenantSlug.replace(/-/g, '_')}`;
  const recordRes = await pgPool.query<Record<string, unknown>>(
    `SELECT * FROM ${schema}.${template.tableId} WHERE id = $1`,
    [recordId],
  );

  if (recordRes.rowCount === 0) {
    return NextResponse.json({ error: 'Record not found' }, { status: 404 });
  }

  const record = recordRes.rows[0];

  // Load child records for each TableBlock's relation field
  const tableBlocks = template.blocks.filter(b => b.type === 'table');
  const childRecords: Record<string, Record<string, unknown>[]> = {};

  for (const block of tableBlocks) {
    if (block.type !== 'table') continue;
    const relField = block.relationField;
    try {
      const childRes = await pgPool.query<Record<string, unknown>>(
        `SELECT * FROM ${schema}.${relField} WHERE parent_id = $1`,
        [recordId],
      );
      childRecords[relField] = childRes.rows;
    } catch {
      // If child table doesn't exist or has no parent_id, skip
      childRecords[relField] = [];
    }
  }

  const pdfBuffer = await renderPdf({
    template,
    record,
    childRecords,
    tenantSlug,
  });

  const filename = `${template.name.replace(/\s+/g, '_')}_${recordId}.pdf`;

  return new NextResponse(pdfBuffer, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': String(pdfBuffer.length),
    },
  });
}
