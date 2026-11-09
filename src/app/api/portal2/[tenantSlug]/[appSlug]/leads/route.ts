import { NextRequest, NextResponse } from 'next/server'
import { verifyPortalToken } from '@/platform/portals/auth'
import { pgPool } from '@/lib/db/client'

async function auth(req: NextRequest) {
  const token = req.headers.get("authorization")?.replace(/^Bearer /, "") || req.cookies.get("portal_token")?.value || ""
  if (!token) return null
  return verifyPortalToken(token)
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ tenantSlug: string }> }) {
  const { tenantSlug } = await params
  const payload = await auth(req)
  if (!payload) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const schema = "tenant_" + tenantSlug
  await pgPool.query("CREATE TABLE IF NOT EXISTS " + schema + ".leads (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), name TEXT NOT NULL, company TEXT, email TEXT, phone TEXT, source TEXT DEFAULT 'Manual', status TEXT DEFAULT 'new', value NUMERIC(12,2), assigned_to TEXT, notes TEXT, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW())")
  const r = await pgPool.query("SELECT * FROM " + schema + ".leads ORDER BY created_at DESC LIMIT 200")
  return NextResponse.json({ rows: r.rows, count: r.rowCount })
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ tenantSlug: string }> }) {
  const { tenantSlug } = await params
  const payload = await auth(req)
  if (!payload) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const body = await req.json()
  const schema = "tenant_" + tenantSlug
  await pgPool.query("CREATE TABLE IF NOT EXISTS " + schema + ".leads (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), name TEXT NOT NULL, company TEXT, email TEXT, phone TEXT, source TEXT DEFAULT 'Manual', status TEXT DEFAULT 'new', value NUMERIC(12,2), assigned_to TEXT, notes TEXT, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW())")
  const { name, company, email, phone, source, status, value, assigned_to, notes } = body
  if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 })
  const r = await pgPool.query("INSERT INTO " + schema + ".leads (name,company,email,phone,source,status,value,assigned_to,notes) VALUES (,,,,,,,,) RETURNING *", [name, company||null, email||null, phone||null, source||"Manual", status||"new", value||null, assigned_to||null, notes||null])
  return NextResponse.json({ row: r.rows[0] }, { status: 201 })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ tenantSlug: string }> }) {
  const { tenantSlug } = await params
  const payload = await auth(req)
  if (!payload) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const body = await req.json()
  const { id, name, company, email, phone, source, status, value, assigned_to, notes } = body
  if (!id) return NextResponse.json({ error: "ID required" }, { status: 400 })
  const schema = "tenant_" + tenantSlug
  const r = await pgPool.query("UPDATE " + schema + ".leads SET name=,company=,email=,phone=,source=,status=,value=,assigned_to=,notes=,updated_at=NOW() WHERE id=0 RETURNING *", [name, company||null, email||null, phone||null, source||"Manual", status||"new", value||null, assigned_to||null, notes||null, id])
  return NextResponse.json({ row: r.rows[0] })
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ tenantSlug: string }> }) {
  const { tenantSlug } = await params
  const payload = await auth(req)
  if (!payload) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id } = await req.json()
  if (!id) return NextResponse.json({ error: "ID required" }, { status: 400 })
  const schema = "tenant_" + tenantSlug
  await pgPool.query("DELETE FROM " + schema + ".leads WHERE id=", [id])
  return NextResponse.json({ success: true })
}
