import { NextRequest, NextResponse } from 'next/server'
import { pgPool } from '@/lib/db/client'
import { requireSessionTenant } from '@/lib/auth/tenant-session'

/**
 * POST /api/runtime/pdf/render
 * Body: { templateId, data: Record<string, unknown> }
 * Returns HTML string with interpolated data, ready for print/PDF.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const ctx = await requireSessionTenant()
  if (ctx instanceof NextResponse) return ctx
  try {
    const body = await req.json() as { templateId?: string; data?: Record<string, unknown> }
    if (!body.templateId) return NextResponse.json({ error: 'templateId required' }, { status: 400 })

    // Try tenant schema first, then fall back to platform.pdf_templates filtered by tenant.
    const tenantSchema = `tenant_${ctx.tenant.slug}`
    let result = await pgPool.query(
      `SELECT * FROM ${tenantSchema}.pdf_templates WHERE id = $1::uuid LIMIT 1`,
      [body.templateId]
    ).catch(() => ({ rows: [] as unknown[] }))
    if (result.rows.length === 0) {
      result = await pgPool.query(
        `SELECT * FROM platform.pdf_templates WHERE id = $1::uuid AND tenant_slug = $2 LIMIT 1`,
        [body.templateId, ctx.tenant.slug]
      ).catch(() => ({ rows: [] as unknown[] }))
    }
    if (result.rows.length === 0) return NextResponse.json({ error: 'Template not found' }, { status: 404 })

    const template = result.rows[0] as { body: string; name: string; page_size: string; orientation: string }
    const data = body.data ?? {}

    // Interpolate {{ key }} and {{ nested.key }} placeholders
    const html = template.body.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key: string) => {
      const parts = key.split('.')
      let val: unknown = data
      for (const part of parts) {
        val = (val as Record<string, unknown>)?.[part]
      }
      return val != null ? String(val) : ''
    })

    // Wrap in a printable HTML page
    const fullHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${template.name}</title>
  <style>
    @page {
      size: ${template.page_size ?? 'A4'} ${template.orientation === 'landscape' ? 'landscape' : 'portrait'};
      margin: 20mm;
    }
    body {
      font-family: system-ui, -apple-system, sans-serif;
      font-size: 12pt;
      color: #111;
      line-height: 1.5;
    }
    * { box-sizing: border-box; }
  </style>
</head>
<body>
${html}
</body>
</html>`

    return NextResponse.json({ html: fullHtml })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
