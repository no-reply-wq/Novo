import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/tenant-session';
import { MODULE } from '@/lib/auth/modules';
import { tenantQuery } from '@/lib/db/client';
import { listTablesInTenantSchema } from '@/lib/db/schema-introspection';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tenantSlug = searchParams.get('tenant');
  if (!tenantSlug) return NextResponse.json({ error: 'Missing tenant' }, { status: 400 });

  const ctx = await requirePermission(tenantSlug, MODULE.FORM_BUILDER, 'view');
  if (ctx instanceof NextResponse) return ctx;

  const [tables, masters] = await Promise.all([
    listTablesInTenantSchema(ctx.schemaName),
    tenantQuery<{ id: string; name: string }>(
      ctx.schemaName,
      `SELECT id, name FROM form_configs WHERE is_master = true AND active = true ORDER BY name`
    ),
  ]);

  return NextResponse.json({
    sources: [
      ...masters.rows.map((m) => ({ value: `form:${m.id}`, label: `📋 ${m.name} (Master)` })),
      ...tables.map((t) => ({ value: t, label: t })),
    ],
  });
}
