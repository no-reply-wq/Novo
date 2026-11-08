/**
 * POST /api/runtime/hr/biometric-import
 *
 * Multipart form upload. Fields:
 *   file       — the CSV file from the biometric device
 *   tableApiKey — the Novo attendance table API key
 *
 * Auth: tenant user (session required, tenantSlug taken from session).
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { parseBiometricCsv, importBiometricRecords } from '@/platform/hr/biometric-import';
import { pgPool } from '@/lib/db/client';

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.tenantSlug) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const contentType = req.headers.get('content-type') ?? '';
  if (!contentType.includes('multipart/form-data')) {
    return NextResponse.json({ error: 'Expected multipart/form-data' }, { status: 415 });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Failed to parse form data' }, { status: 400 });
  }

  const file = formData.get('file') as File | null;
  const tableApiKey = formData.get('tableApiKey') as string | null;

  if (!file) return NextResponse.json({ error: 'file is required' }, { status: 400 });
  if (!tableApiKey) return NextResponse.json({ error: 'tableApiKey is required' }, { status: 400 });

  const buffer = Buffer.from(await file.arrayBuffer());
  const records = await parseBiometricCsv(buffer);

  if (records.length === 0) {
    return NextResponse.json({ imported: 0, skipped: 0, errors: ['No parseable records found in CSV'] });
  }

  const result = await importBiometricRecords(
    records,
    tableApiKey,
    session.user.tenantSlug,
    pgPool,
  );

  return NextResponse.json(result);
}
