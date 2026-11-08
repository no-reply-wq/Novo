/**
 * POST /api/runtime/dedup/check
 * Body: { appId, tableApiKey, tenantSlug, record }
 */

import { NextRequest, NextResponse } from 'next/server';
import { pgPool } from '@/lib/db/client';
import { checkDuplicate, getDedupRules } from '@/platform/dedup/detector';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: { appId?: string; tableApiKey?: string; tenantSlug?: string; record?: Record<string, unknown> };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { appId, tableApiKey, tenantSlug, record } = body;
  if (!appId || !tableApiKey || !tenantSlug || !record) {
    return NextResponse.json({ error: 'appId, tableApiKey, tenantSlug and record are required' }, { status: 400 });
  }

  try {
    const rules = await getDedupRules(appId, tableApiKey, pgPool);
    if (rules.length === 0) return NextResponse.json({ isDuplicate: false, confidence: 0, matchedFields: [], suggestion: 'create_anyway' });

    for (const rule of rules) {
      const result = await checkDuplicate(record, rule, appId, tenantSlug, pgPool);
      if (result.isDuplicate) {
        if (rule.action === 'block') {
          return NextResponse.json({ ...result, blocked: true }, { status: 409 });
        }
        return NextResponse.json({ ...result, blocked: false });
      }
    }
    return NextResponse.json({ isDuplicate: false, confidence: 0, matchedFields: [], suggestion: 'create_anyway' });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Error' }, { status: 500 });
  }
}
