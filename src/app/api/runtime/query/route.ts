import { NextRequest, NextResponse } from 'next/server';
import { requireTenantSession } from '@/lib/auth/tenant-session';
import { executeQuery } from '@/lib/runtime/query';
import type { QueryDefinition } from '@/types/runtime';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ctx = await requireTenantSession(req);
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
    const result = await executeQuery(definition, ctx.schemaName, ctx.userId, {
      page: page ?? 1,
      pageSize: pageSize ?? definition.limit ?? 50,
      params: params ?? {},
    });

    return NextResponse.json(result);
  } catch (err) {
    console.error('[runtime/query] execute error:', err);
    return NextResponse.json({ error: 'Query execution failed' }, { status: 500 });
  }
}
