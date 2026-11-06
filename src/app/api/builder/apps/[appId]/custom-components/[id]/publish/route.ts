import { NextRequest, NextResponse } from 'next/server'
import { pgPool } from '@/lib/db/client'

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ appId: string; id: string }> }
): Promise<NextResponse> {
  const { appId, id } = await params
  const r = await pgPool.query<{ id: string; version: number }>(
    `UPDATE platform.custom_components_v2
     SET compiled_code = source_code,
         version = version + 1,
         updated_at = now()
     WHERE id = $1 AND app_id = $2
     RETURNING id, version`,
    [id, appId]
  )
  if (r.rows.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ published: true, version: r.rows[0]!.version })
}
