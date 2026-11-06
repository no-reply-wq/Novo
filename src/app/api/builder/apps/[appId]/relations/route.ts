/**
 * GET  /api/builder/apps/[appId]/relations  — list relations for an app
 * POST /api/builder/apps/[appId]/relations  — create a relation
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import { rowToRelation, type RelationRow, type RelationType, type CascadeRule } from '@/platform/data/relations';

type Params = { appId: string };

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<Params> },
): Promise<NextResponse> {
  const { appId } = await params;

  const rows = await prisma.$queryRaw<RelationRow[]>`
    SELECT * FROM platform.table_relations
    WHERE app_id = ${appId}::uuid
    ORDER BY created_at ASC
  `;

  return NextResponse.json(rows.map(rowToRelation));
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<Params> },
): Promise<NextResponse> {
  const { appId } = await params;
  const body = (await req.json()) as {
    name: string;
    type: RelationType;
    sourceTableId: string;
    targetTableId: string;
    sourceField: string;
    targetField?: string;
    junctionTable?: string;
    cascadeOnDelete?: CascadeRule;
    cascadeOnUpdate?: CascadeRule;
    inverseLabel?: string;
  };

  const rows = await prisma.$queryRaw<RelationRow[]>`
    INSERT INTO platform.table_relations (
      app_id, name, type,
      source_table_id, target_table_id,
      source_field, target_field, junction_table,
      cascade_on_delete, cascade_on_update,
      inverse_label
    ) VALUES (
      ${appId}::uuid,
      ${body.name},
      ${body.type},
      ${body.sourceTableId}::uuid,
      ${body.targetTableId}::uuid,
      ${body.sourceField},
      ${body.targetField ?? null},
      ${body.junctionTable ?? null},
      ${body.cascadeOnDelete ?? 'restrict'},
      ${body.cascadeOnUpdate ?? 'restrict'},
      ${body.inverseLabel ?? null}
    ) RETURNING *
  `;

  return NextResponse.json(rowToRelation(rows[0]), { status: 201 });
}
