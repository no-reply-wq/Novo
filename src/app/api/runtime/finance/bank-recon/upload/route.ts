/**
 * POST /api/runtime/finance/bank-recon/upload
 * multipart/form-data: file (CSV)
 */
import { NextRequest, NextResponse } from 'next/server';
import { parseBankStatementCsv } from '@/platform/finance/bank-recon';
import { requireSessionTenant } from '@/lib/auth/tenant-session';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ctx = await requireSessionTenant();
  if (ctx instanceof NextResponse) return ctx;
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    if (!file) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const statements = await parseBankStatementCsv(buffer);
    return NextResponse.json({ count: statements.length, statements });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
