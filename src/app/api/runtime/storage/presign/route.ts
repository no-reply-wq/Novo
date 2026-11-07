/**
 * POST /api/runtime/storage/presign
 *
 * Returns a presigned S3/R2 upload URL for a file field on a table record.
 *
 * Body: { appId, tenantSlug, tableApiKey, fieldApiKey, fileName, contentType, recordId? }
 * Returns: { uploadUrl, publicUrl, key }
 *
 * Key format: tenant_<slug>/<appId>/<tableApiKey>/<recordId_or_new>/<uuid>/<fileName>
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { z } from 'zod';
import { pgPool } from '@/lib/db/client';
import { decryptSecret } from '@/platform/integrations/secrets';
import { NotConfiguredError } from '@/platform/integrations/secrets/manager';
import crypto from 'crypto';

const PresignBody = z.object({
  appId: z.string().min(1),
  tenantSlug: z.string().min(1),
  tableApiKey: z.string().min(1),
  fieldApiKey: z.string().min(1),
  fileName: z.string().min(1),
  contentType: z.string().min(1),
  recordId: z.string().optional(),
  expiresInSeconds: z.number().int().min(60).max(86400).default(3600),
});

interface StorageIntegrationConfig {
  bucket: string;
  region: string;
  endpoint?: string;
  accessKeyId: string; // encrypted
  secretAccessKey: string; // encrypted
  publicBaseUrl?: string;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const parsed = PresignBody.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { appId, tenantSlug, tableApiKey, fieldApiKey, fileName, contentType, recordId, expiresInSeconds } = parsed.data;

  // Load storage config for tenant
  const result = await pgPool.query<{ config: StorageIntegrationConfig }>(
    `SELECT config FROM platform.integration_configs
     WHERE tenant_slug = $1 AND type IN ('s3', 'r2') AND enabled = true
     ORDER BY created_at DESC LIMIT 1`,
    [tenantSlug],
  );

  if (result.rows.length === 0) {
    throw new NotConfiguredError(`No storage integration configured for tenant: ${tenantSlug}`);
  }

  const cfg = result.rows[0].config;
  const accessKeyId = decryptSecret(cfg.accessKeyId, tenantSlug);
  const secretAccessKey = decryptSecret(cfg.secretAccessKey, tenantSlug);

  const s3 = new S3Client({
    region: cfg.region ?? 'auto',
    endpoint: cfg.endpoint,
    credentials: { accessKeyId, secretAccessKey },
    forcePathStyle: !!cfg.endpoint, // R2 requires path-style
  });

  const recordKey = recordId ?? 'new';
  const uuid = crypto.randomUUID();
  const key = `tenant_${tenantSlug}/${appId}/${tableApiKey}/${recordKey}/${uuid}/${fileName}`;

  const command = new PutObjectCommand({
    Bucket: cfg.bucket,
    Key: key,
    ContentType: contentType,
  });

  const uploadUrl = await getSignedUrl(s3, command, { expiresIn: expiresInSeconds });

  const publicUrl = cfg.publicBaseUrl
    ? `${cfg.publicBaseUrl.replace(/\/$/, '')}/${key}`
    : `https://${cfg.bucket}.s3.${cfg.region}.amazonaws.com/${key}`;

  return NextResponse.json({ uploadUrl, publicUrl, key });
}
