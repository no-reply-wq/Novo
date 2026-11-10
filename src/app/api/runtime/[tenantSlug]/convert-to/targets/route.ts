/**
 * GET /api/runtime/[tenantSlug]/convert-to/targets?tableId=X
 *
 * Returns the convert-to configs whose sourceTableId matches tableId,
 * giving the UI the list of available conversion targets.
 */

import { NextRequest, NextResponse } from 'next/server';
import { pgPool } from '@/lib/db/client';
import { requireTenantSession } from '@/lib/auth/tenant-session';

export interface ConvertToTarget {
  configId: string;
  name: string;
  targetTableId: string;
  targetTableName: string;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ tenantSlug: string }> },
): Promise<NextResponse> {
  const { tenantSlug } = await params;
  const ctx = await requireTenantSession(tenantSlug);
  if (ctx instanceof NextResponse) return ctx;

  const tableId = req.nextUrl.searchParams.get('tableId');
  if (!tableId) {
    return NextResponse.json({ error: 'tableId query param is required' }, { status: 400 });
  }

  const result = await pgPool.query<{
    id: string;
    name: string;
    target_table_id: string;
    target_table_name: string | null;
  }>(
    `SELECT
       c.id,
       c.name,
       c.target_table_id,
       t.name AS target_table_name
     FROM platform.convert_to_configs c
     LEFT JOIN platform.tables t ON t.id = c.target_table_id
     WHERE c.source_table_id = $1
     ORDER BY c.name`,
    [tableId],
  );

  const targets: ConvertToTarget[] = result.rows.map((row) => ({
    configId: row.id,
    name: row.name,
    targetTableId: row.target_table_id,
    targetTableName: row.target_table_name ?? row.target_table_id,
  }));

  return NextResponse.json({ targets });
}
