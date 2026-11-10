/**
 * GET  /api/builder/apps/[appId]/child-tables  — list child table configs
 * POST /api/builder/apps/[appId]/child-tables  — create a child table config
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireBuilderApp } from '@/lib/auth/tenant-session';
import { prisma } from '@/lib/db/client';
import {
  rowToChildTableConfig,
  type ChildTableConfigRow,
} from '@/platform/data/child-tables';

type Params = { appId: string };

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<Params> },
): Promise<NextResponse> {
  const { appId } = await params;
  const url = new URL(req.url);
  const ctx = await requireBuilderApp(appId, url.searchParams);
  if (ctx instanceof NextResponse) return ctx;
  const parentTableId = url.searchParams.get('parentTableId');

  const rows = parentTableId
    ? await prisma.$queryRaw<ChildTableConfigRow[]>`
        SELECT ctc.*
        FROM platform.child_table_configs ctc
        JOIN platform.table_relations tr
          ON tr.source_table_id = ctc.parent_table_id
        WHERE tr.app_id = ${appId}::uuid
          AND ctc.parent_table_id = ${parentTableId}::uuid
        ORDER BY ctc.display_order ASC
      `
    : await prisma.$queryRaw<ChildTableConfigRow[]>`
        SELECT ctc.*
        FROM platform.child_table_configs ctc
        JOIN platform.table_relations tr
          ON tr.source_table_id = ctc.parent_table_id
        WHERE tr.app_id = ${appId}::uuid
        ORDER BY ctc.display_order ASC
      `;

  return NextResponse.json(rows.map(rowToChildTableConfig));
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<Params> },
): Promise<NextResponse> {
  const { appId } = await params;
  const ctx = await requireBuilderApp(appId, new URL(req.url).searchParams);
  if (ctx instanceof NextResponse) return ctx;
  const body = (await req.json()) as {
    parentTableId: string;
    childTableId: string;
    parentField: string;
    depth?: number;
    displayOrder?: number;
    label: string;
    allowAdd?: boolean;
    allowDelete?: boolean;
    allowReorder?: boolean;
  };

  const rows = await prisma.$queryRaw<ChildTableConfigRow[]>`
    INSERT INTO platform.child_table_configs (
      parent_table_id, child_table_id, parent_field,
      depth, display_order, label,
      allow_add, allow_delete, allow_reorder
    ) VALUES (
      ${body.parentTableId}::uuid,
      ${body.childTableId}::uuid,
      ${body.parentField},
      ${body.depth ?? 0},
      ${body.displayOrder ?? 0},
      ${body.label},
      ${body.allowAdd ?? true},
      ${body.allowDelete ?? true},
      ${body.allowReorder ?? false}
    ) RETURNING *
  `;

  return NextResponse.json(rowToChildTableConfig(rows[0]), { status: 201 });
}

/**
 * DELETE /api/builder/apps/[appId]/child-tables?id=<childTableConfigId>
 * Removes a child-table display config. The id may also be supplied in the
 * JSON body as { id } to match clients that send it there.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<Params> },
): Promise<NextResponse> {
  const { appId } = await params;
  const url = new URL(req.url);
  const ctx = await requireBuilderApp(appId, url.searchParams);
  if (ctx instanceof NextResponse) return ctx;

  let id = url.searchParams.get('id') ?? url.searchParams.get('childId');
  if (!id) {
    const body = (await req.json().catch(() => ({}))) as { id?: string; childId?: string };
    id = body.id ?? body.childId ?? null;
  }
  if (!id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 });
  }

  // Only delete configs that belong to a table relation within this app.
  const result = await prisma.$executeRaw`
    DELETE FROM platform.child_table_configs ctc
    USING platform.table_relations tr
    WHERE ctc.id = ${id}::uuid
      AND tr.source_table_id = ctc.parent_table_id
      AND tr.app_id = ${appId}::uuid
  `;
  if (result === 0) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  return new NextResponse(null, { status: 204 });
}
