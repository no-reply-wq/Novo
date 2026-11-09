import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/config'
import { pgPool } from '@/lib/db/client'

async function ensureTable() {
  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS platform.pdf_templates (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      app_id UUID NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      body TEXT NOT NULL DEFAULT '',
      variables JSONB DEFAULT '[]'::jsonb,
      page_size TEXT NOT NULL DEFAULT 'A4',
      orientation TEXT NOT NULL DEFAULT 'portrait',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `)
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ appId: string }> }
): Promise<NextResponse> {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { appId } = await params

  try {
    await ensureTable()
    const result = await pgPool.query(
      `SELECT id, name, description, page_size, orientation, created_at, updated_at
       FROM platform.pdf_templates
       WHERE app_id = $1::uuid
       ORDER BY created_at DESC`,
      [appId]
    )
    return NextResponse.json({ templates: result.rows })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ appId: string }> }
): Promise<NextResponse> {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { appId } = await params

  try {
    await ensureTable()
    const body = await req.json() as {
      name?: string; description?: string; body?: string
      pageSize?: string; orientation?: string
    }
    if (!body.name) return NextResponse.json({ error: 'name required' }, { status: 400 })

    const result = await pgPool.query(
      `INSERT INTO platform.pdf_templates (app_id, name, description, body, page_size, orientation)
       VALUES ($1::uuid, $2, $3, $4, $5, $6)
       RETURNING *`,
      [appId, body.name, body.description ?? null, body.body ?? '', body.pageSize ?? 'A4', body.orientation ?? 'portrait']
    )
    return NextResponse.json({ template: result.rows[0] }, { status: 201 })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
