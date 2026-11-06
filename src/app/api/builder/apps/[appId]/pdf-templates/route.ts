import { NextRequest, NextResponse } from 'next/server';
import type { PDFTemplate } from '@/platform/pdf/types';

// In-memory store for now; production would use the platform.pdf_templates table
const templateStore = new Map<string, PDFTemplate[]>();

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ appId: string }> }
) {
  const { appId } = await params;
  const templates = templateStore.get(appId) ?? [];
  return NextResponse.json({ templates });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ appId: string }> }
) {
  const { appId } = await params;
  const body = (await req.json()) as Partial<PDFTemplate>;

  const template: PDFTemplate = {
    id: crypto.randomUUID(),
    appId,
    name: body.name ?? 'Untitled Template',
    pageSize: body.pageSize ?? 'A4',
    orientation: body.orientation ?? 'portrait',
    margins: body.margins ?? { top: 20, right: 15, bottom: 20, left: 15 },
    header: body.header,
    footer: body.footer,
    body: body.body ?? [],
    styles: body.styles ?? {},
  };

  const existing = templateStore.get(appId) ?? [];
  templateStore.set(appId, [...existing, template]);

  return NextResponse.json({ template }, { status: 201 });
}
