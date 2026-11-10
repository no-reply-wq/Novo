/**
 * POST /api/builder/apps/[appId]/integrations/storage/test
 *
 * Tests connectivity to an S3/R2 bucket using credentials supplied in the
 * request body. Returns { ok: true } on success, or { ok: false, error } with
 * a 422 when the bucket is unreachable or credentials are incomplete.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireBuilderApp } from '@/lib/auth/tenant-session';
import { getStorageClient } from '@/platform/storage/client';
import type { StorageConfig } from '@/platform/storage/types';

interface TestBody {
  provider?: 's3' | 'r2';
  bucket?: string;
  region?: string;
  endpoint?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ appId: string }> },
): Promise<NextResponse> {
  const { appId } = await params;
  const ctx = await requireBuilderApp(appId, new URL(req.url).searchParams);
  if (ctx instanceof NextResponse) return ctx;

  let body: TestBody;
  try {
    body = (await req.json()) as TestBody;
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body.bucket || !body.accessKeyId || !body.secretAccessKey) {
    return NextResponse.json(
      { ok: false, error: 'Not configured — bucket, accessKeyId and secretAccessKey are required' },
      { status: 422 },
    );
  }

  const config: StorageConfig = {
    provider: body.provider ?? 's3',
    bucket: body.bucket,
    region: body.region || 'auto',
    accessKeyId: body.accessKeyId,
    secretAccessKey: body.secretAccessKey,
    ...(body.endpoint ? { endpoint: body.endpoint } : {}),
  };

  try {
    const client = getStorageClient(config);
    // A list with an unlikely prefix is a cheap connectivity/permission probe.
    await client.list('__novo_connection_test__/');
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Connection failed' },
      { status: 422 },
    );
  }
}
