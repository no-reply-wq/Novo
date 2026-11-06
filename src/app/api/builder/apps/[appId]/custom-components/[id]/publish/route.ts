import { NextRequest, NextResponse } from 'next/server';
import { pgPool } from '@/lib/db/client';

/**
 * POST /api/builder/apps/[appId]/custom-components/[id]/publish
 * Bumps version and marks the component as published (future: runs esbuild).
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ appId: string; id: string }> },
): Promise<NextResponse> {
  const { appId, id } = await params;

  const result = await pgPool.query<{ id: string; version: number }>(
    `UPDATE platform.custom_components_v2
     SET version = version + 1,
         compiled_code = source_code,  -- placeholder: future esbuild output
         updated_at = now()
     WHERE id = $1 AND app_id = $2
     RETURNING id, version`,
    [id, appId],
  );

  if (result.rows.length === 0) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  return NextResponse.json({ published: true, version: result.rows[0]!.version });
}
