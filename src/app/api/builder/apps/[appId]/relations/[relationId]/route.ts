import { NextRequest, NextResponse } from 'next/server';
import { requireBuilderApp } from '@/lib/auth/tenant-session';
import { prisma } from '@/lib/db/client';

type Params = { appId: string; relationId: string };

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<Params> }
): Promise<NextResponse> {
  const { appId, relationId } = await params;
  const { searchParams } = new URL(req.url);
  const ctx = await requireBuilderApp(appId, searchParams);
  if (ctx instanceof NextResponse) return ctx;
  try {
    await prisma.$executeRaw`
      DELETE FROM platform.table_relations
      WHERE id = ${relationId}::uuid AND app_id = ${appId}::uuid
    `;
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    console.error('DELETE relation error:', err);
    return NextResponse.json({ error: 'Failed to delete relation' }, { status: 500 });
  }
}
