/**
 * GST R1 Download — Runtime API
 * GET /api/runtime/gstr1/download/[filingId]?format=json|csv&tenant=slug
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { pgPool } from '@/lib/db/client';
import type { GSTR1Return } from '@/platform/integrations/gstr1/types';
import { generateGSTR1JSON, generateGSTR1Summary } from '@/platform/integrations/gstr1/generator';

export const dynamic = 'force-dynamic';

async function authorize(tenantSlug: string): Promise<NextResponse | null> {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!session.user.isPlatformAdmin && session.user.tenantSlug !== tenantSlug) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  return null;
}

type Params = { params: Promise<{ filingId: string }> };

export async function GET(req: NextRequest, { params }: Params): Promise<NextResponse> {
  const { filingId } = await params;
  const tenantSlug = req.nextUrl.searchParams.get('tenant') ?? '';
  const format = req.nextUrl.searchParams.get('format') ?? 'json';

  if (!tenantSlug) {
    return NextResponse.json({ error: 'Missing tenant parameter' }, { status: 400 });
  }
  if (format !== 'json' && format !== 'csv') {
    return NextResponse.json({ error: 'Invalid format. Use json or csv.' }, { status: 400 });
  }

  const authErr = await authorize(tenantSlug);
  if (authErr) return authErr;

  const result = await pgPool.query<{ period: string; summary: GSTR1Return }>(
    `SELECT period, summary FROM platform.gstr1_filings
     WHERE id = $1 AND tenant_slug = $2`,
    [filingId, tenantSlug]
  );

  if (result.rows.length === 0) {
    return NextResponse.json({ error: 'Filing not found' }, { status: 404 });
  }

  const { period, summary } = result.rows[0];

  if (format === 'csv') {
    const csv = generateGSTR1Summary(summary);
    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="GSTR1_${summary.gstin}_${period}.csv"`,
      },
    });
  }

  const json = generateGSTR1JSON(summary);
  return new NextResponse(json, {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="GSTR1_${summary.gstin}_${period}.json"`,
    },
  });
}
