import { NextRequest, NextResponse } from 'next/server'
import { tenantQuery } from '@/lib/db/client'
import { v4 as uuidv4 } from 'uuid'

// In-memory rate limiter: ip → { count, resetAt }
const rateLimitMap = new Map<string, { count: number; resetAt: number }>()

const RATE_LIMIT = 10
const RATE_WINDOW_MS = 60 * 60 * 1000 // 1 hour

function getClientIp(req: NextRequest): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    'unknown'
  )
}

function checkRateLimit(ip: string): boolean {
  const now = Date.now()
  const entry = rateLimitMap.get(ip)

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS })
    return true
  }

  if (entry.count >= RATE_LIMIT) {
    return false
  }

  entry.count++
  return true
}

// Cleanup old entries periodically (lazy cleanup on each request)
function cleanupRateLimit(): void {
  const now = Date.now()
  for (const [key, val] of rateLimitMap.entries()) {
    if (now > val.resetAt) {
      rateLimitMap.delete(key)
    }
  }
}

interface PublicFormConfig {
  tableSlug: string
  schemaName: string
  fields: string[]
  successMessage?: string
}

/** POST /api/portal/[tenantSlug]/forms/[formSlug]/submit — no auth required */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ tenantSlug: string; formSlug: string }> }
): Promise<NextResponse> {
  const { tenantSlug, formSlug } = await params

  // Rate limiting
  const ip = getClientIp(req)
  cleanupRateLimit()
  if (!checkRateLimit(ip)) {
    return NextResponse.json(
      { error: 'Too many submissions. Please try again later.' },
      { status: 429 }
    )
  }

  // Load form configuration from platform.public_forms
  const formResult = await tenantQuery<{ id: string; config: PublicFormConfig }>(
    'platform',
    `SELECT id, config FROM platform.public_forms WHERE tenant_slug = $1 AND slug = $2 AND is_active = true LIMIT 1`,
    [tenantSlug, formSlug]
  ).catch(() => ({ rows: [] as { id: string; config: PublicFormConfig }[] }))

  if (formResult.rows.length === 0) {
    return NextResponse.json({ error: 'Form not found' }, { status: 404 })
  }

  const formConfig = formResult.rows[0].config
  const { tableSlug, schemaName, fields, successMessage } = formConfig

  if (!tableSlug || !schemaName) {
    return NextResponse.json({ error: 'Form is not configured correctly' }, { status: 500 })
  }

  const body = await req.json() as {
    data: Record<string, unknown>
    captchaToken?: string
  }

  if (!body.data || typeof body.data !== 'object') {
    return NextResponse.json({ error: 'Missing form data' }, { status: 400 })
  }

  // Filter to only allowed fields
  const allowedFields = fields && fields.length > 0 ? fields : Object.keys(body.data)
  const record: Record<string, unknown> = { id: uuidv4() }
  for (const field of allowedFields) {
    if (field in body.data) {
      record[field] = body.data[field]
    }
  }

  if (Object.keys(record).length <= 1) {
    return NextResponse.json({ error: 'No valid fields provided' }, { status: 400 })
  }

  // Build INSERT
  const cols = Object.keys(record)
  const vals = Object.values(record)
  const placeholders = cols.map((_, i) => `$${i + 1}`)

  await tenantQuery(
    schemaName,
    `INSERT INTO ${tableSlug} (${cols.join(', ')}) VALUES (${placeholders.join(', ')})`,
    vals
  )

  return NextResponse.json({
    success: true,
    message: successMessage ?? 'Your submission was received. Thank you!',
  })
}
