/**
 * Custom Component Versions API
 * GET /api/builder/custom-components/[componentId]/versions — list version history
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { pgPool } from '@/lib/db/client';

interface DbVersionRow {
  id: string;
  component_id: string;
  version: number;
  code: string;
  created_at: Date;
}

interface DbComponentTenantRow {
  tenant_slug: string;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ componentId: string }> }
) {
  const { componentId } = await params;

  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Verify component exists and check tenant access
  const compResult = await pgPool.query<DbComponentTenantRow>(
    `SELECT tenant_slug FROM platform.custom_components WHERE id = $1`,
    [componentId]
  );

  if (compResult.rows.length === 0) {
    return NextResponse.json({ error: 'Component not found' }, { status: 404 });
  }

  const { tenant_slug } = compResult.rows[0];
  if (!session.user.isPlatformAdmin && session.user.tenantSlug !== tenant_slug) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const result = await pgPool.query<DbVersionRow>(
    `SELECT * FROM platform.custom_component_versions
     WHERE component_id = $1
     ORDER BY version DESC`,
    [componentId]
  );

  const versions = result.rows.map((row: DbVersionRow) => ({
    id: row.id,
    componentId: row.component_id,
    version: row.version,
    code: row.code,
    createdAt: row.created_at.toISOString(),
  }));

  return NextResponse.json({ versions });
}
