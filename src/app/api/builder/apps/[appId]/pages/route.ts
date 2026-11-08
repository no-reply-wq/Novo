import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/tenant-session';
import { MODULE } from '@/lib/auth/modules';
import { tenantQuery } from '@/lib/db/client';
import { v4 as uuidv4 } from 'uuid';

type Params = { appId: string };

async function ensurePagesMeta(schemaName: string): Promise<void> {
  await tenantQuery(
    schemaName,
    `CREATE TABLE IF NOT EXISTS _pages (
      id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      app_id      TEXT NOT NULL DEFAULT '',
      name        TEXT NOT NULL,
      slug        TEXT NOT NULL,
      layout      JSONB DEFAULT '[]'::jsonb,
      rank        INT  DEFAULT 0,
      created_at  TIMESTAMPTZ DEFAULT NOW(),
      updated_at  TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(app_id, slug)
    )`
  );
  await tenantQuery(schemaName, `ALTER TABLE _pages ADD COLUMN IF NOT EXISTS rank INT DEFAULT 0`).catch(() => {});
  await tenantQuery(schemaName, `ALTER TABLE _pages ADD COLUMN IF NOT EXISTS layout JSONB DEFAULT '[]'::jsonb`).catch(() => {});
}

// GET /api/builder/apps/[appId]/pages?tenant=...
export async function GET(req: NextRequest, { params }: { params: Promise<Params> }) {
  const { appId } = await params;
  const tenantSlug = req.nextUrl.searchParams.get('tenant') ?? '';
  if (!tenantSlug) return NextResponse.json({ error: 'Missing tenant' }, { status: 400 });

  const ctx = await requirePermission(tenantSlug, MODULE.UI_BUILDER, 'view');
  if (ctx instanceof NextResponse) return ctx;

  const schemaName = ctx.schemaName;

  try {
    await ensurePagesMeta(schemaName);
    const result = await tenantQuery<{
      id: string; name: string; slug: string; layout: unknown; created_at: string;
    }>(
      schemaName,
      `SELECT id, name, slug, layout, created_at FROM _pages WHERE app_id = $1 ORDER BY rank ASC, created_at ASC`,
      [appId]
    );
    const pages = result.rows.map((r) => ({
      id: r.id,
      name: r.name,
      slug: r.slug,
      layout: Array.isArray(r.layout) ? r.layout : [],
      createdAt: r.created_at,
    }));
    return NextResponse.json({ pages });
  } catch (err) {
    console.error('GET /pages error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/builder/apps/[appId]/pages?tenant=...
export async function POST(req: NextRequest, { params }: { params: Promise<Params> }) {
  const { appId } = await params;
  const tenantSlug = req.nextUrl.searchParams.get('tenant') ?? '';
  if (!tenantSlug) return NextResponse.json({ error: 'Missing tenant' }, { status: 400 });

  const ctx = await requirePermission(tenantSlug, MODULE.UI_BUILDER, 'create');
  if (ctx instanceof NextResponse) return ctx;

  const schemaName = ctx.schemaName;

  let body: { id?: string; name?: string; slug?: string; layout?: unknown[] };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const name = (body.name ?? 'Page').trim();
  const slug = (body.slug ?? name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')).slice(0, 100) || 'page';
  const layout = JSON.stringify(Array.isArray(body.layout) ? body.layout : []);

  try {
    await ensurePagesMeta(schemaName);

    const countResult = await tenantQuery<{ count: string }>(
      schemaName,
      `SELECT COUNT(*)::text as count FROM _pages WHERE app_id = $1`,
      [appId]
    );
    const rank = parseInt(countResult.rows[0]?.count ?? '0', 10);

    const id = body.id && body.id.length >= 20 ? body.id : uuidv4();
    const insertResult = await tenantQuery<{ id: string; name: string; slug: string; layout: unknown; created_at: string }>(
      schemaName,
      `INSERT INTO _pages (id, app_id, name, slug, layout, rank)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6)
       ON CONFLICT (app_id, slug) DO UPDATE
         SET name = EXCLUDED.name, layout = EXCLUDED.layout, updated_at = NOW()
       RETURNING id, name, slug, layout, created_at`,
      [id, appId, name, slug, layout, rank]
    );
    const row = insertResult.rows[0];
    return NextResponse.json({
      page: {
        id: row.id,
        name: row.name,
        slug: row.slug,
        layout: Array.isArray(row.layout) ? row.layout : [],
        createdAt: row.created_at,
      }
    }, { status: 201 });
  } catch (err) {
    console.error('POST /pages error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PUT /api/builder/apps/[appId]/pages?tenant=...
export async function PUT(req: NextRequest, { params }: { params: Promise<Params> }) {
  const { appId } = await params;
  const tenantSlug = req.nextUrl.searchParams.get('tenant') ?? '';
  if (!tenantSlug) return NextResponse.json({ error: 'Missing tenant' }, { status: 400 });

  const ctx = await requirePermission(tenantSlug, MODULE.UI_BUILDER, 'edit');
  if (ctx instanceof NextResponse) return ctx;

  const schemaName = ctx.schemaName;

  let body: { id?: string; name?: string; slug?: string; layout?: unknown[] };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!body.id) return NextResponse.json({ error: 'Page id required' }, { status: 400 });

  const layout = JSON.stringify(Array.isArray(body.layout) ? body.layout : []);

  try {
    await ensurePagesMeta(schemaName);
    const updateResult = await tenantQuery<{ id: string; name: string; slug: string; layout: unknown; created_at: string }>(
      schemaName,
      `UPDATE _pages SET layout = $1::jsonb, updated_at = NOW()
       WHERE id = $2 AND app_id = $3
       RETURNING id, name, slug, layout, created_at`,
      [layout, body.id, appId]
    );
    if (updateResult.rows.length === 0) return NextResponse.json({ error: 'Page not found' }, { status: 404 });
    const row = updateResult.rows[0];
    return NextResponse.json({
      page: {
        id: row.id,
        name: row.name,
        slug: row.slug,
        layout: Array.isArray(row.layout) ? row.layout : [],
        createdAt: row.created_at,
      }
    });
  } catch (err) {
    console.error('PUT /pages error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
