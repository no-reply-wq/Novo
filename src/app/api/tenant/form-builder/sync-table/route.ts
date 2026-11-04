/**
 * Form Builder — Sync Table API
 *
 * POST /api/tenant/form-builder/sync-table?tenant=slug
 *
 * Called whenever a form's fields are saved. Creates (or alters) the
 * backing real PostgreSQL table `ct_<formSlug>` so form submissions
 * write to typed columns instead of a JSONB blob.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/tenant-session';
import { MODULE } from '@/lib/auth/modules';
import { tenantQuery } from '@/lib/db/client';
import { z } from 'zod';

const SyncTableSchema = z.object({
  formId: z.string().min(1),
});

// Validate identifiers before using them in DDL statements
const SAFE_IDENTIFIER = /^[a-z][a-z0-9_]{0,62}$/;

// Slugs may contain hyphens (e.g. "e2e-test") which are valid in URL slugs
// but not in PostgreSQL identifiers. Convert to underscores before DDL.
function slugToIdentifier(slug: string): string {
  return slug.replace(/-/g, '_');
}

function assertSafeIdentifier(value: string, label: string): string {
  if (!SAFE_IDENTIFIER.test(value)) {
    throw new Error(`${label} "${value}" is not a valid SQL identifier`);
  }
  return value;
}

const PG_TYPE: Record<string, string> = {
  text:     'TEXT',
  textarea: 'TEXT',
  number:   'NUMERIC(18,4)',
  dropdown: 'TEXT',
  date:     'DATE',
  checkbox: 'BOOLEAN DEFAULT false',
};

function pgType(fieldType: string): string {
  return PG_TYPE[fieldType] ?? 'TEXT';
}

export async function POST(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tenantSlug = searchParams.get('tenant');
  if (!tenantSlug) return NextResponse.json({ error: 'Missing tenant' }, { status: 400 });

  const ctx = await requirePermission(tenantSlug, MODULE.FORM_BUILDER, 'edit');
  if (ctx instanceof NextResponse) return ctx;

  let rawBody: unknown;
  try { rawBody = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  const parsed = SyncTableSchema.safeParse(rawBody);
  if (!parsed.success) return NextResponse.json({ error: 'Validation failed', issues: parsed.error.issues }, { status: 400 });
  const { formId } = parsed.data;

  const formResult = await tenantQuery(
    ctx.schemaName,
    `SELECT id, slug FROM form_configs WHERE id = $1 AND active = true`,
    [formId]
  );
  if (!formResult.rows.length) {
    return NextResponse.json({ error: 'Form not found' }, { status: 404 });
  }
  const form = formResult.rows[0] as { id: string; slug: string };
  // Convert slug to a safe SQL identifier (hyphens → underscores) then validate
  const slugIdentifier = slugToIdentifier(form.slug);
  assertSafeIdentifier(slugIdentifier, 'form slug as identifier');
  const tableName = `ct_${slugIdentifier}`;
  const itemsTableName = `ct_${slugIdentifier}_items`;

  const fieldsResult = await tenantQuery(
    ctx.schemaName,
    `SELECT key, field_type, is_line_item, is_required, is_row_number, formula_type
     FROM form_fields
     WHERE form_id = $1
     ORDER BY is_line_item, sort_order`,
    [formId]
  );
  const fields = fieldsResult.rows as Array<{
    key: string;
    field_type: string;
    is_line_item: boolean;
    is_required: boolean;
    is_row_number: boolean;
    formula_type: string | null;
  }>;

  // Filter fields and validate their keys before using them as column names in DDL
  const headerFields = fields.filter(
    f => !f.is_line_item && f.field_type !== 'formula' && !f.is_row_number && SAFE_IDENTIFIER.test(f.key)
  );
  const lineItemFields = fields.filter(
    f => f.is_line_item && f.field_type !== 'formula' && !f.is_row_number && SAFE_IDENTIFIER.test(f.key)
  );

  await tenantQuery(ctx.schemaName, `
    CREATE TABLE IF NOT EXISTS ${tableName} (
      id               TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      is_test          BOOLEAN NOT NULL DEFAULT false,
      document_number  TEXT,
      pdf_url          TEXT,
      submitted_by     TEXT REFERENCES users(id),
      thread_id        TEXT,
      revision_number  INT NOT NULL DEFAULT 1,
      is_latest        BOOLEAN NOT NULL DEFAULT true,
      submitted_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  for (const f of headerFields) {
    const colType = pgType(f.field_type);
    await tenantQuery(
      ctx.schemaName,
      `ALTER TABLE ${tableName} ADD COLUMN IF NOT EXISTS ${f.key} ${colType}`
    );
  }

  if (lineItemFields.length > 0) {
    await tenantQuery(ctx.schemaName, `
      CREATE TABLE IF NOT EXISTS ${itemsTableName} (
        id           TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
        submission_id TEXT NOT NULL REFERENCES ${tableName}(id) ON DELETE CASCADE,
        row_index    INT NOT NULL
      )
    `);

    for (const f of lineItemFields) {
      const colType = pgType(f.field_type);
      await tenantQuery(
        ctx.schemaName,
        `ALTER TABLE ${itemsTableName} ADD COLUMN IF NOT EXISTS ${f.key} ${colType}`
      );
    }
  }

  await tenantQuery(
    ctx.schemaName,
    `UPDATE form_configs SET has_backing_table = true, updated_at = NOW() WHERE id = $1`,
    [formId]
  );

  return NextResponse.json({
    ok: true,
    tableName,
    itemsTableName: lineItemFields.length > 0 ? itemsTableName : null,
    headerColumns: headerFields.map(f => f.key),
    lineItemColumns: lineItemFields.map(f => f.key),
  });
}
