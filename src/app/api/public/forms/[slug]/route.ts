import { NextRequest, NextResponse } from 'next/server';
import { tenantQuery } from '@/lib/db/client';
import { resolveTenantFromSlug } from '@/lib/tenant/resolver';

// Simple in-process rate limiter: max 20 req/min per IP
const _rateLimitMap = new Map<string, { count: number; resetAt: number }>();
function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = _rateLimitMap.get(ip);
  if (!entry || entry.resetAt < now) {
    _rateLimitMap.set(ip, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  entry.count += 1;
  return entry.count <= 20;
}

function getIp(req: NextRequest): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { searchParams } = new URL(req.url);
  const tenantParam = searchParams.get('tenant');
  if (!tenantParam) return NextResponse.json({ error: 'Missing tenant' }, { status: 400 });

  if (!checkRateLimit(getIp(req))) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

  const tenant = await resolveTenantFromSlug(tenantParam);
  if (!tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
  if (tenant.status !== 'ACTIVE') return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });

  try {
    const r = await tenantQuery(
      tenant.schemaName,
      `SELECT id, name, slug, description, is_active, is_public, public_settings
       FROM form_configs WHERE slug = $1 AND is_active = true AND is_public = true`,
      [slug],
    );
    if (!r.rows.length) return NextResponse.json({ error: 'Form not found' }, { status: 404 });
    const form = r.rows[0];

    const fieldsResult = await tenantQuery(
      tenant.schemaName,
      `SELECT key, label, is_required, is_line_item FROM form_fields WHERE form_id = $1 ORDER BY sort_order`,
      [form.id],
    );

    return NextResponse.json({
      form: {
        id: form.id,
        slug: form.slug,
        name: form.name,
        description: form.description,
        public_settings: form.public_settings,
        fields: fieldsResult.rows,
      },
    });
  } catch {
    return NextResponse.json({ error: 'Form not found' }, { status: 404 });
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { searchParams } = new URL(req.url);
  const tenantParam = searchParams.get('tenant');
  if (!tenantParam) return NextResponse.json({ error: 'Missing tenant' }, { status: 400 });

  if (!checkRateLimit(getIp(req))) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

  const tenant = await resolveTenantFromSlug(tenantParam);
  if (!tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
  if (tenant.status !== 'ACTIVE') return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });

  try {
    const r = await tenantQuery(
      tenant.schemaName,
      `SELECT id, name, slug, is_active, is_public, public_settings
       FROM form_configs WHERE slug = $1 AND is_active = true AND is_public = true`,
      [slug],
    );
    if (!r.rows.length) return NextResponse.json({ error: 'Form not found' }, { status: 404 });
    const form = r.rows[0];

    const fieldsResult = await tenantQuery<{ key: string; label: string; is_required: boolean; is_line_item: boolean }>(
      tenant.schemaName,
      `SELECT key, label, is_required, is_line_item FROM form_fields WHERE form_id = $1 ORDER BY sort_order`,
      [form.id],
    );
    const fields = fieldsResult.rows;

    const headerKeys = new Set(fields.filter((f) => !f.is_line_item).map((f) => f.key));
    const lineItemKeys = new Set(fields.filter((f) => f.is_line_item).map((f) => f.key));

    const body = await req.json();
    // Use a null-prototype object to avoid __proto__ / constructor pollution
    const rawData: Record<string, unknown> = Object.assign(Object.create(null) as Record<string, unknown>, body?.data ?? {});
    const rawLineItems: Array<Record<string, unknown>> = Array.isArray(body?.line_items) ? body.line_items : [];

    // Validate required header fields
    for (const f of fields.filter((x) => x.is_required && !x.is_line_item)) {
      const v = rawData[f.key];
      if (v === undefined || v === null || v === '') {
        return NextResponse.json({ error: `${f.label} is required` }, { status: 400 });
      }
    }

    // Whitelist header data
    const headerData: Record<string, unknown> = {};
    for (const k of headerKeys) {
      if (Object.prototype.hasOwnProperty.call(rawData, k)) {
        headerData[k] = rawData[k];
      }
    }

    // Enforce line-item limit
    if (rawLineItems.length > 200) {
      return NextResponse.json({ error: 'Too many line items (max 200)' }, { status: 400 });
    }

    // Whitelist line-item keys
    const lineItems = rawLineItems.map((row) => {
      const clean: Record<string, unknown> = {};
      for (const k of lineItemKeys) {
        if (Object.prototype.hasOwnProperty.call(row, k)) {
          clean[k] = row[k];
        }
      }
      return clean;
    });

    const submissionId = crypto.randomUUID();
    await tenantQuery(
      tenant.schemaName,
      `INSERT INTO form_submissions (id, form_id, submitted_at, header_data, line_items_data, status)
       VALUES ($1, $2, NOW(), $3::jsonb, $4::jsonb, 'pending')`,
      [submissionId, form.id, JSON.stringify(headerData), JSON.stringify(lineItems)],
    );

    const settings = form.public_settings as { success_message?: string; redirect_url?: string } | null;
    return NextResponse.json(
      { ok: true, success_message: settings?.success_message ?? 'Thank you for your submission!', redirect_url: settings?.redirect_url ?? null },
      { status: 201 },
    );
  } catch {
    return NextResponse.json({ error: 'Submission failed. Please try again.' }, { status: 500 });
  }
}
