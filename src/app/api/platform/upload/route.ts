import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/tenant-session';
import { MODULE } from '@/lib/auth/modules';
import { writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { v4 as uuid } from 'uuid';

// Allowed MIME types grouped
const MIME_GROUPS: Record<string, string[]> = {
  'image/jpeg': ['jpg','jpeg'],
  'image/png': ['png'],
  'image/webp': ['webp'],
  'image/gif': ['gif'],
  'image/svg+xml': ['svg'],
  'image/bmp': ['bmp'],
  'image/tiff': ['tiff','tif'],
  'video/mp4': ['mp4'],
  'video/webm': ['webm'],
  'video/quicktime': ['mov'],
  'video/x-msvideo': ['avi'],
  'application/pdf': ['pdf'],
  'application/msword': ['doc'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['docx'],
  'application/vnd.ms-excel': ['xls'],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['xlsx'],
  'text/plain': ['txt'],
  'text/csv': ['csv'],
  'application/zip': ['zip'],
  'application/json': ['json'],
};

function getExtension(mimeType: string): string {
  const exts = MIME_GROUPS[mimeType];
  return exts ? exts[0] : 'bin';
}

export async function POST(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tenantSlug = searchParams.get('tenant');
  if (!tenantSlug) return NextResponse.json({ error: 'Missing tenant' }, { status: 400 });

  // Validate session
  const ctx = await requirePermission(tenantSlug, MODULE.UPLOAD, 'view');
  if (ctx instanceof NextResponse) return ctx;

  // Parse config from query params
  const maxSizeMb = parseFloat(searchParams.get('max_size_mb') ?? '10');
  const maxFiles = parseInt(searchParams.get('max_files') ?? '10');
  const acceptParam = searchParams.get('accept') ?? ''; // comma-separated mime types, empty = all
  const allowedTypes = acceptParam ? acceptParam.split(',').map(s => s.trim()).filter(Boolean) : [];

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 });
  }

  const files = formData.getAll('files') as File[];
  if (!files.length) return NextResponse.json({ error: 'No files uploaded' }, { status: 400 });
  if (files.length > maxFiles) return NextResponse.json({ error: `Maximum ${maxFiles} file(s) allowed` }, { status: 400 });

  const maxSizeBytes = maxSizeMb * 1024 * 1024;
  const results: Array<{ url: string; name: string; size: number; type: string; }> = [];
  const errors: string[] = [];

  for (const file of files) {
    // Validate type
    if (allowedTypes.length > 0 && !allowedTypes.includes(file.type)) {
      const friendlyTypes = allowedTypes.map(t => MIME_GROUPS[t]?.[0]?.toUpperCase() ?? t).join(', ');
      errors.push(`${file.name}: file type not allowed. Accepted: ${friendlyTypes}`);
      continue;
    }

    // Validate size
    if (file.size > maxSizeBytes) {
      errors.push(`${file.name}: file too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum: ${maxSizeMb} MB`);
      continue;
    }

    // Validate known MIME
    if (!MIME_GROUPS[file.type] && allowedTypes.length === 0) {
      // Still allow it, just use generic extension
    }

    try {
      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);

      // Build path: /public/uploads/{tenant}/{YYYY-MM}/{uuid}.ext
      const dateFolder = new Date().toISOString().slice(0, 7); // YYYY-MM
      const ext = getExtension(file.type) || file.name.split('.').pop() || 'bin';
      const filename = `${uuid()}.${ext}`;
      const relativePath = `uploads/${tenantSlug}/${dateFolder}`;
      const absoluteDir = path.join(process.cwd(), 'public', relativePath);

      if (!existsSync(absoluteDir)) {
        await mkdir(absoluteDir, { recursive: true });
      }

      await writeFile(path.join(absoluteDir, filename), buffer);
      const url = `/${relativePath}/${filename}`;

      results.push({ url, name: file.name, size: file.size, type: file.type });
    } catch (e) {
      errors.push(`${file.name}: upload failed — ${(e as Error).message}`);
    }
  }

  if (!results.length && errors.length) {
    return NextResponse.json({ error: errors[0], errors }, { status: 400 });
  }

  return NextResponse.json({ ok: true, files: results, errors });
}
