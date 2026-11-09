/**
 * GET  /api/builder/apps/[appId]/integrations/storage  — fetch storage config
 * POST /api/builder/apps/[appId]/integrations/storage  — upsert storage config
 *
 * Config is persisted in the tenant's own schema (storage_configs table).
 * The S3/R2 secret access key is encrypted at rest and never returned to the
 * client in plaintext.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireBuilderApp } from '@/lib/auth/tenant-session';
import { tenantQuery } from '@/lib/db/client';
import { encryptSecret } from '@/platform/integrations/secrets';

interface StorageConfigBody {
  provider?: 's3' | 'r2';
  bucket?: string;
  region?: string;
  endpoint?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  publicBaseUrl?: string;
  allowedTypes?: string[];
  maxSizeMb?: number;
}

async function ensureTable(schemaName: string): Promise<void> {
  await tenantQuery(
    schemaName,
    `CREATE TABLE IF NOT EXISTS storage_configs (
      app_id TEXT PRIMARY KEY,
      provider TEXT NOT NULL DEFAULT 's3',
      bucket TEXT NOT NULL DEFAULT '',
      region TEXT NOT NULL DEFAULT '',
      endpoint TEXT,
      access_key_id TEXT,
      secret_access_key TEXT,
      public_base_url TEXT,
      allowed_types JSONB NOT NULL DEFAULT '[]',
      max_size_mb INT NOT NULL DEFAULT 50,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )`,
  );
}

interface StorageConfigRow {
  app_id: string;
  provider: string;
  bucket: string;
  region: string;
  endpoint: string | null;
  access_key_id: string | null;
  secret_access_key: string | null;
  public_base_url: string | null;
  allowed_types: string[];
  max_size_mb: number;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ appId: string }> },
): Promise<NextResponse> {
  const { appId } = await params;
  const ctx = await requireBuilderApp(appId, new URL(req.url).searchParams);
  if (ctx instanceof NextResponse) return ctx;

  await ensureTable(ctx.schemaName);
  const result = await tenantQuery<StorageConfigRow>(
    ctx.schemaName,
    `SELECT * FROM storage_configs WHERE app_id = $1 LIMIT 1`,
    [appId],
  );

  if (result.rows.length === 0) {
    return NextResponse.json({ config: null }, { status: 200 });
  }

  const row = result.rows[0];
  return NextResponse.json({
    config: {
      provider: row.provider,
      bucket: row.bucket,
      region: row.region,
      endpoint: row.endpoint ?? '',
      accessKeyId: row.access_key_id ?? '',
      // Never leak the secret; indicate whether one is stored.
      secretAccessKey: row.secret_access_key ? '***' : '',
      publicBaseUrl: row.public_base_url ?? '',
      allowedTypes: row.allowed_types ?? [],
      maxSizeMb: row.max_size_mb,
    },
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ appId: string }> },
): Promise<NextResponse> {
  const { appId } = await params;
  const ctx = await requireBuilderApp(appId, new URL(req.url).searchParams);
  if (ctx instanceof NextResponse) return ctx;

  let body: StorageConfigBody;
  try {
    body = (await req.json()) as StorageConfigBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body.bucket || !body.accessKeyId || !body.secretAccessKey) {
    return NextResponse.json(
      { error: 'bucket, accessKeyId and secretAccessKey are required' },
      { status: 400 },
    );
  }

  await ensureTable(ctx.schemaName);

  // Encrypt the secret unless the client echoed back the masked placeholder,
  // in which case keep the existing stored value.
  let encryptedSecret: string | null = null;
  try {
    if (body.secretAccessKey === '***') {
      const existing = await tenantQuery<{ secret_access_key: string | null }>(
        ctx.schemaName,
        `SELECT secret_access_key FROM storage_configs WHERE app_id = $1 LIMIT 1`,
        [appId],
      );
      encryptedSecret = existing.rows[0]?.secret_access_key ?? null;
    } else {
      encryptedSecret = encryptSecret(body.secretAccessKey, ctx.tenant.slug);
    }
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to encrypt secret' },
      { status: 500 },
    );
  }

  await tenantQuery(
    ctx.schemaName,
    `INSERT INTO storage_configs
       (app_id, provider, bucket, region, endpoint, access_key_id, secret_access_key, public_base_url, allowed_types, max_size_mb, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
     ON CONFLICT (app_id) DO UPDATE SET
       provider = EXCLUDED.provider,
       bucket = EXCLUDED.bucket,
       region = EXCLUDED.region,
       endpoint = EXCLUDED.endpoint,
       access_key_id = EXCLUDED.access_key_id,
       secret_access_key = EXCLUDED.secret_access_key,
       public_base_url = EXCLUDED.public_base_url,
       allowed_types = EXCLUDED.allowed_types,
       max_size_mb = EXCLUDED.max_size_mb,
       updated_at = NOW()`,
    [
      appId,
      body.provider ?? 's3',
      body.bucket,
      body.region ?? '',
      body.endpoint ?? null,
      body.accessKeyId,
      encryptedSecret,
      body.publicBaseUrl ?? null,
      JSON.stringify(body.allowedTypes ?? []),
      body.maxSizeMb ?? 50,
    ],
  );

  return NextResponse.json({ ok: true }, { status: 200 });
}
