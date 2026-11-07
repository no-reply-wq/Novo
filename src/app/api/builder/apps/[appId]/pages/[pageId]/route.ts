import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import type { CanvasPage } from '@/platform/ui/canvas/types';

type Params = { appId: string; pageId: string };

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<Params> },
) {
  const { appId, pageId } = await params;
  const rows = await prisma.$queryRaw<Array<{
    id: string; app_id: string; name: string; slug: string;
    icon: string | null; canvas_definition: unknown; updated_at: Date;
  }>>`
    SELECT id, app_id, name, slug, icon, canvas_definition, updated_at
    FROM platform.app_pages
    WHERE id = ${pageId}::uuid AND app_id = ${appId}::uuid
    LIMIT 1
  `;
  if (rows.length === 0) return NextResponse.json({ error: 'Page not found' }, { status: 404 });
  const row = rows[0];
  const def = (row.canvas_definition ?? {}) as Partial<CanvasPage>;
  const page: CanvasPage = {
    id: row.id, appId: row.app_id, name: row.name, slug: row.slug, icon: row.icon ?? undefined,
    layout: def.layout ?? { type: 'grid', columns: 12, gap: 8 },
    components: def.components ?? [],
    pageState: def.pageState ?? [],
    updatedAt: row.updated_at.toISOString(),
  };
  return NextResponse.json(page);
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<Params> },
) {
  const { appId, pageId } = await params;
  let body: Partial<CanvasPage>;
  try { body = (await req.json()) as Partial<CanvasPage>; }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  const canvasDefinition = {
    layout: body.layout ?? { type: 'grid', columns: 12, gap: 8 },
    components: body.components ?? [],
    pageState: body.pageState ?? [],
  };
  const updated = await prisma.$executeRaw`
    UPDATE platform.app_pages
    SET canvas_definition = ${JSON.stringify(canvasDefinition)}::jsonb, updated_at = NOW()
    WHERE id = ${pageId}::uuid AND app_id = ${appId}::uuid
  `;
  if (updated === 0) return NextResponse.json({ error: 'Page not found' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
