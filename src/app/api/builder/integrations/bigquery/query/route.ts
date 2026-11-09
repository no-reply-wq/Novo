/**
 * POST /api/builder/integrations/bigquery/query
 *
 * Run a BigQuery SQL query and return results.
 *
 * Body: { sql, tenantSlug, maxRows? }
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireSessionTenant } from '@/lib/auth/tenant-session';
import { runBigQuerySQL } from '@/platform/integrations/bigquery/reader';
import { NotConfiguredError } from '@/platform/integrations/secrets/manager';

interface BigQueryRequestBody {
  sql: string;
  maxRows?: number;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ctx = await requireSessionTenant();
  if (ctx instanceof NextResponse) return ctx;

  let body: BigQueryRequestBody;
  try {
    body = (await req.json()) as BigQueryRequestBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { sql, maxRows } = body;
  const tenantSlug = ctx.tenant.slug;

  if (!sql) {
    return NextResponse.json(
      { error: 'sql is required' },
      { status: 400 }
    );
  }

  try {
    const result = await runBigQuerySQL({ tenantSlug, sql, maxRows });
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof NotConfiguredError) {
      return NextResponse.json({ error: err.message }, { status: 422 });
    }
    console.error('[bigquery/query]', err);
    return NextResponse.json({ error: 'Query failed' }, { status: 500 });
  }
}
