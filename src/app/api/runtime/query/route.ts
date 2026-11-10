import { NextRequest, NextResponse } from 'next/server';
import { requireSessionTenant } from '@/lib/auth/tenant-session';
import { executeQuery } from '@/lib/runtime/query';
import type { QueryDefinition } from '@/types/runtime';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ctx = await requireSessionTenant();
  if (ctx instanceof NextResponse) return ctx;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { definition, page, pageSize, params } = body as {
    definition: QueryDefinition;
    page?: number;
    pageSize?: number;
    params?: Record<string, unknown>;
  };

  if (!definition || typeof definition !== 'object') {
    return NextResponse.json({ error: 'Missing query definition' }, { status: 400 });
  }

  if (!['table', 'script', 'connector'].includes(definition.type)) {
    return NextResponse.json({ error: 'Invalid query type' }, { status: 400 });
  }

  try {
    // Collect the user's role(s) and locations for RLS context injection.
    // permissions.roleId is a single role; wrap it in an array.
    // Locations are not stored in TenantContext today — pass empty array so that
    // RLS policies using `user.locations` see an empty set (deny-safe default).
    // TODO: load user locations from the tenant schema's user_locations join table
    // once that table exists, and pass them here.
    const roles = ctx.permissions.roleId ? [ctx.permissions.roleId] : [];
    const locations: string[] = [];

    const result = await executeQuery(definition, ctx.schemaName, ctx.userId, {
      page: page ?? 1,
      pageSize: pageSize ?? definition.limit ?? 50,
      params: params ?? {},
      roles,
      locations,
    });

    return NextResponse.json(result);
  } catch (err) {
    console.error('[runtime/query] execute error:', err);
    return NextResponse.json({ error: 'Query execution failed' }, { status: 500 });
  }
}
