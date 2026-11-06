/**
 * POST /api/runtime/[tenantSlug]/files/upload
 *
 * Accepts multipart/form-data with fields:
 *   - tableId   (string)
 *   - recordId  (string)
 *   - fieldId   (string)
 *   - file      (File / Blob)
 *
 * Max size: 50 MB.
 * Returns: { key, url, size, contentType }
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireTenantSession } from '@/lib/auth/tenant-session';
import { pgPool } from '@/lib/db/client';
import { uploadFile, getSignedDownloadUrl } from '@/platform/integrations/storage/storage';
import { NotConfiguredError } from '@/platform/integrations/secrets/manager';

export const dynamic = 'force-dynamic';

const MAX_SIZE_BYTES = 50 * 1024 * 1024; // 50 MB

const ALLOWED_TYPES = new Set([
  // Images
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/avif',
  // Documents
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  // Data
  'text/csv', 'text/plain',
  // Archives
  'application/zip', 'application/x-zip-compressed',
]);

interface RouteParams {
  params: Promise<{ tenantSlug: string }>;
}

export async function POST(req: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { tenantSlug } = await params;

  const ctx = await requireTenantSession(req, tenantSlug);
  if (ctx instanceof NextResponse) return ctx;

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Expected multipart/form-data body' }, { status: 400 });
  }

  const tableId = formData.get('tableId');
  const recordId = formData.get('recordId');
  const fieldId = formData.get('fieldId');
  const file = formData.get('file');

  if (!tableId || typeof tableId !== 'string') {
    return NextResponse.json({ error: 'Missing required field: tableId' }, { status: 400 });
  }
  if (!recordId || typeof recordId !== 'string') {
    return NextResponse.json({ error: 'Missing required field: recordId' }, { status: 400 });
  }
  if (!fieldId || typeof fieldId !== 'string') {
    return NextResponse.json({ error: 'Missing required field: fieldId' }, { status: 400 });
  }
  if (!file || typeof file === 'string') {
    return NextResponse.json({ error: 'Missing required field: file' }, { status: 400 });
  }

  const blob = file as Blob;
  const originalName = (file as File).name ?? 'upload';
  const contentType = blob.type || 'application/octet-stream';

  if (!ALLOWED_TYPES.has(contentType)) {
    return NextResponse.json(
      { error: `File type "${contentType}" is not allowed` },
      { status: 415 }
    );
  }

  if (blob.size > MAX_SIZE_BYTES) {
    return NextResponse.json(
      { error: `File exceeds maximum size of 50 MB (got ${blob.size} bytes)` },
      { status: 413 }
    );
  }

  const buffer = Buffer.from(await blob.arrayBuffer());

  // Key convention: {tenantSlug}/{tableId}/{recordId}/{fieldId}/{filename}
  const sanitizedName = originalName.replace(/[^a-zA-Z0-9._-]/g, '_');
  const key = `${tenantSlug}/${tableId}/${recordId}/${fieldId}/${Date.now()}_${sanitizedName}`;

  try {
    const { key: storedKey } = await uploadFile({
      tenantSlug,
      key,
      buffer,
      contentType,
      visibility: 'private',
    });

    // Record in platform.file_uploads
    await pgPool.query(
      `INSERT INTO platform.file_uploads
         (tenant_slug, table_id, record_id, field_id, storage_key, original_name, content_type, size_bytes, uploaded_by)
       VALUES ($1, $2::uuid, $3, $4, $5, $6, $7, $8, $9)`,
      [tenantSlug, tableId, recordId, fieldId, storedKey, originalName, contentType, blob.size, ctx.userId]
    );

    // Generate a 1-hour signed URL for immediate use
    const url = await getSignedDownloadUrl({ tenantSlug, key: storedKey, expiresIn: 3600 });

    return NextResponse.json({ key: storedKey, url, size: blob.size, contentType });
  } catch (err) {
    if (err instanceof NotConfiguredError) {
      return NextResponse.json(
        { error: 'Storage not configured for this tenant' },
        { status: 503 }
      );
    }
    console.error('[files/upload] Unexpected error:', err);
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
  }
}
