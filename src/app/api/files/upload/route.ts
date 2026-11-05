/**
 * File upload endpoint — integration-aware multipart POST.
 * POST /api/files/upload?tenant=slug
 *
 * Accepts multipart/form-data with 'files' entries.
 * Uploads to the tenant's configured s3/r2 integration if present,
 * otherwise falls back to the platform-level storage (env-based R2).
 *
 * Returns signed download URLs for each uploaded file.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { v4 as uuid } from 'uuid';
import { pgPool } from '@/lib/db/client';
import { decryptSecret } from '@/platform/integrations/secrets';
import {
  uploadFile as libUploadFile,
  getSignedUrl as libGetSignedUrl,
  validateFileType,
  presignUrl,
} from '@/lib/storage';

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/gif',
  'video/mp4', 'video/webm', 'video/quicktime',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain', 'text/csv',
  'application/zip', 'application/json',
]);

const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

interface UploadResult {
  url: string;
  key: string;
  name: string;
  size: number;
  type: string;
}

interface TenantStorageConfig {
  bucket: string;
  region: string;
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
  publicBaseUrl?: string;
}

/** Try to load tenant-specific S3/R2 credentials */
async function getTenantStorageConfig(tenantSlug: string): Promise<TenantStorageConfig | null> {
  try {
    const result = await pgPool.query<{ config: Record<string, string> }>(
      `SELECT config FROM platform.integration_configs
       WHERE tenant_slug = $1 AND type IN ('s3', 'r2') AND enabled = true
       ORDER BY created_at DESC LIMIT 1`,
      [tenantSlug]
    );
    if (result.rows.length === 0) return null;
    const { config } = result.rows[0];
    if (!config['bucket'] || !config['region'] || !config['accessKeyId'] || !config['secretAccessKey']) {
      return null;
    }
    return {
      bucket: config['bucket'],
      region: config['region'],
      endpoint: config['endpoint'] ?? `https://s3.${config['region']}.amazonaws.com`,
      accessKeyId: decryptSecret(config['accessKeyId'], tenantSlug),
      secretAccessKey: decryptSecret(config['secretAccessKey'], tenantSlug),
      publicBaseUrl: config['publicBaseUrl'],
    };
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  const tenantSlug = req.nextUrl.searchParams.get('tenant') ?? '';
  if (!tenantSlug) {
    return NextResponse.json({ error: 'Missing tenant parameter' }, { status: 400 });
  }

  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!session.user.isPlatformAdmin && session.user.tenantSlug !== tenantSlug) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 });
  }

  const files = formData.getAll('files') as File[];
  const tableId = (formData.get('table') as string | null) ?? 'uploads';
  const recordId = (formData.get('recordId') as string | null) ?? uuid();

  if (!files.length) {
    return NextResponse.json({ error: 'No files uploaded' }, { status: 400 });
  }

  const tenantStorage = await getTenantStorageConfig(tenantSlug);

  const results: UploadResult[] = [];
  const errors: string[] = [];

  for (const file of files) {
    if (file.size > MAX_SIZE_BYTES) {
      errors.push(`${file.name}: too large (max 10 MB)`);
      continue;
    }

    if (!ALLOWED_MIME_TYPES.has(file.type)) {
      errors.push(`${file.name}: file type "${file.type}" not allowed`);
      continue;
    }

    try {
      const bytes = await file.arrayBuffer();
      const buf = Buffer.from(bytes);

      validateFileType(file.type, buf, file.name);

      // Key pattern: {tenantSlug}/{table}/{recordId}/{filename}
      const safeFilename = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const key = `${tenantSlug}/${tableId}/${recordId}/${uuid()}_${safeFilename}`;

      let signedUrl: string;

      if (tenantStorage) {
        // Use tenant's own S3/R2 bucket via presigned PUT
        const putUrl = presignUrl({
          bucket: tenantStorage.bucket,
          region: tenantStorage.region,
          endpoint: tenantStorage.endpoint,
          accessKeyId: tenantStorage.accessKeyId,
          secretAccessKey: tenantStorage.secretAccessKey,
          key,
          method: 'PUT',
          expiresIn: 60,
          contentType: file.type,
        });

        const uploadRes = await fetch(putUrl, {
          method: 'PUT',
          headers: { 'Content-Type': file.type },
          body: new Blob([new Uint8Array(buf)]),
        });

        if (!uploadRes.ok) {
          throw new Error(`Upload failed: ${uploadRes.status} ${uploadRes.statusText}`);
        }

        signedUrl = presignUrl({
          bucket: tenantStorage.bucket,
          region: tenantStorage.region,
          endpoint: tenantStorage.endpoint,
          accessKeyId: tenantStorage.accessKeyId,
          secretAccessKey: tenantStorage.secretAccessKey,
          key,
          method: 'GET',
          expiresIn: 900,
        });
      } else {
        // Fall back to platform storage
        await libUploadFile(key, buf, file.type);
        signedUrl = await libGetSignedUrl(key, 900);
      }

      results.push({ url: signedUrl, key, name: file.name, size: file.size, type: file.type });
    } catch (e) {
      errors.push(`${file.name}: ${(e as Error).message}`);
    }
  }

  if (!results.length && errors.length) {
    return NextResponse.json({ error: errors[0], errors }, { status: 400 });
  }

  return NextResponse.json({ ok: true, files: results, errors });
}
