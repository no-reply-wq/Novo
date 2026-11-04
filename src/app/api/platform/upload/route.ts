import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/tenant-session';
import { MODULE } from '@/lib/auth/modules';
import { v4 as uuid } from 'uuid';
import { validateFileType, uploadFile, getSignedUrl } from '@/lib/storage';

// MIME types allowed for upload. SVG and HTML are explicitly excluded.
const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/bmp',
  'image/tiff',
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'video/x-msvideo',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
  'text/csv',
  'application/zip',
  'application/json',
]);

const MIME_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/bmp': 'bmp',
  'image/tiff': 'tif',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
  'video/x-msvideo': 'avi',
  'application/pdf': 'pdf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'text/plain': 'txt',
  'text/csv': 'csv',
  'application/zip': 'zip',
  'application/json': 'json',
};

/** Max upload size in bytes — server-side, never from query params. */
const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
const MAX_FILES = 10;

export async function POST(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tenantSlug = searchParams.get('tenant');
  if (!tenantSlug) return NextResponse.json({ error: 'Missing tenant' }, { status: 400 });

  const ctx = await requirePermission(tenantSlug, MODULE.UPLOAD, 'view');
  if (ctx instanceof NextResponse) return ctx;

  // Accept filter from query — but server validates against ALLOWED_MIME_TYPES regardless.
  const acceptParam = searchParams.get('accept') ?? '';
  const clientAllowed = acceptParam
    ? acceptParam.split(',').map((s) => s.trim()).filter(Boolean)
    : [];

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 });
  }

  const files = formData.getAll('files') as File[];
  if (!files.length) return NextResponse.json({ error: 'No files uploaded' }, { status: 400 });
  if (files.length > MAX_FILES) {
    return NextResponse.json({ error: `Maximum ${MAX_FILES} files allowed` }, { status: 400 });
  }

  const results: Array<{ url: string; key: string; name: string; size: number; type: string }> = [];
  const errors: string[] = [];

  for (const file of files) {
    // Size check (server-side limit, not from client params)
    if (file.size > MAX_SIZE_BYTES) {
      errors.push(`${file.name}: too large (max 10 MB)`);
      continue;
    }

    // Server-side MIME allow-list
    if (!ALLOWED_MIME_TYPES.has(file.type)) {
      errors.push(`${file.name}: file type "${file.type}" is not allowed`);
      continue;
    }

    // Client-requested filter (must be a subset of ALLOWED_MIME_TYPES)
    if (clientAllowed.length > 0 && !clientAllowed.includes(file.type)) {
      errors.push(`${file.name}: file type not accepted for this field`);
      continue;
    }

    try {
      const bytes = await file.arrayBuffer();
      const buf = Buffer.from(bytes);

      // Magic-byte validation — blocks SVG and HTML even with wrong MIME type
      validateFileType(file.type, buf, file.name);

      const dateFolder = new Date().toISOString().slice(0, 7); // YYYY-MM
      const ext = MIME_EXT[file.type] ?? file.name.split('.').pop() ?? 'bin';
      const key = `${tenantSlug}/${dateFolder}/${uuid()}.${ext}`;

      await uploadFile(key, buf, file.type);
      const signedUrl = await getSignedUrl(key, 900); // 15 min

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
