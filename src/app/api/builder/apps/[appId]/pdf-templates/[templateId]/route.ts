import { NextRequest, NextResponse } from 'next/server';
import type { PDFTemplate } from '@/platform/pdf/types';

// Shared store (same module-level map as the list route in production would be DB)
const templateStore = new Map<string, PDFTemplate[]>();

function getTemplate(appId: string, templateId: string): PDFTemplate | undefined {
  return (templateStore.get(appId) ?? []).find((t) => t.id === templateId);
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ appId: string; templateId: string }> }
) {
  const { appId, templateId } = await params;
  const template = getTemplate(appId, templateId);
  if (!template) {
    return NextResponse.json({ error: 'Template not found' }, { status: 404 });
  }
  return NextResponse.json({ template });
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ appId: string; templateId: string }> }
) {
  const { appId, templateId } = await params;
  const existing = templateStore.get(appId) ?? [];
  const idx = existing.findIndex((t) => t.id === templateId);
  if (idx === -1) {
    return NextResponse.json({ error: 'Template not found' }, { status: 404 });
  }

  const body = (await req.json()) as Partial<PDFTemplate>;
  const updated: PDFTemplate = {
    ...(existing[idx] as PDFTemplate),
    ...body,
    id: templateId,
    appId,
  };

  const next = [...existing];
  next[idx] = updated;
  templateStore.set(appId, next);

  return NextResponse.json({ template: updated });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ appId: string; templateId: string }> }
) {
  const { appId, templateId } = await params;
  const existing = templateStore.get(appId) ?? [];
  templateStore.set(appId, existing.filter((t) => t.id !== templateId));
  return NextResponse.json({ ok: true });
}
