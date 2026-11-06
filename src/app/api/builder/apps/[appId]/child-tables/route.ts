/**
 * GET  /api/builder/apps/[appId]/child-tables  — list child table configs
 * POST /api/builder/apps/[appId]/child-tables  — create a child table config
 */

import { NextRequest, NextResponse } from 'next/server';
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
  void params; // appId used for auth in real impl
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
