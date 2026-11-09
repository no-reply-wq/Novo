import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/config'
import { pgPool } from '@/lib/db/client'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ appId: string; templateId: string }> }
): Promise<NextResponse> {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { appId, templateId } = await params

  try {
    const result = await pgPool.query(
      `SELECT * FROM platform.pdf_templates WHERE id = $1::uuid AND app_id = $2::uuid LIMIT 1`,
      [templateId, appId]
    )
    if (result.rows.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json({ template: result.rows[0] })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ appId: string; templateId: string }> }
): Promise<NextResponse> {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { appId, templateId } = await params

  try {
    const body = await req.json() as Record<string, unknown>
    const allowed = ['name', 'description', 'body', 'page_size', 'orientation', 'variables']
    const updates = Object.entries(body).filter(([k]) => allowed.includes(k))
    if (updates.length === 0) return NextResponse.json({ error: 'No fields to update' }, { status: 400 })

    const setClauses = updates.map(([k], i) => `"${k}" = $${i + 1}`).join(', ')
    const values = updates.map(([, v]) => v)
    values.push(templateId, appId)

    const result = await pgPool.query(
      `UPDATE platform.pdf_templates
       SET ${setClauses}, updated_at = NOW()
       WHERE id = $${values.length - 1}::uuid AND app_id = $${values.length}::uuid
       RETURNING *`,
      values
    )
    if (result.rows.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json({ template: result.rows[0] })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ appId: string; templateId: string }> }
): Promise<NextResponse> {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { appId, templateId } = await params

  try {
    await pgPool.query(
      `DELETE FROM platform.pdf_templates WHERE id = $1::uuid AND app_id = $2::uuid`,
      [templateId, appId]
    )
    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
