import { NextRequest, NextResponse } from 'next/server';
import { requireTenantSession } from '@/lib/auth/tenant-session';
import { parseDocxTemplate } from '@/lib/pdf/parse-template';

export async function POST(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tenantSlug = searchParams.get('tenant');
  if (!tenantSlug) return NextResponse.json({ error: 'Missing tenant' }, { status: 400 });
  const ctx = await requireTenantSession(tenantSlug);
  if (ctx instanceof NextResponse) return ctx;

  const contentType = req.headers.get('content-type') ?? '';
  let buffer: Buffer;
  let templateUrl: string | null = null;

  if (contentType.includes('multipart/form-data')) {
    const form = await req.formData();
    const file = form.get('file') as File | null;
    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    if (!file.name.endsWith('.docx')) return NextResponse.json({ error: 'Only .docx files are supported' }, { status: 400 });
    buffer = Buffer.from(await file.arrayBuffer());
    templateUrl = `upload:${file.name}`;
  } else {
    const body = await req.json().catch(() => ({}));
    const driveUrl: string = body.driveUrl ?? '';
    if (!driveUrl) return NextResponse.json({ error: 'Provide a file or driveUrl' }, { status: 400 });
    const idMatch = driveUrl.match(/[-\w]{25,}/);
    if (!idMatch) return NextResponse.json({ error: 'Could not extract a file ID from the Drive URL' }, { status: 400 });
    const fileId = idMatch[0];
    let res = await fetch(`https://docs.google.com/document/d/${fileId}/export?format=docx`);
    if (!res.ok) res = await fetch(`https://drive.google.com/uc?export=download&id=${fileId}`);
    if (!res.ok) return NextResponse.json({ error: `Could not download from Google Drive (${res.status}). Make sure the file is shared as "Anyone with the link can view".` }, { status: 400 });
    buffer = Buffer.from(await res.arrayBuffer());
    templateUrl = driveUrl;
  }

  try {
    const fields = parseDocxTemplate(buffer);
    return NextResponse.json({ fields, templateUrl });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed to parse template' }, { status: 400 });
  }
}
