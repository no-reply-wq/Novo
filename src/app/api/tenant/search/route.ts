/**
 * Global Search API
 * Searches across form submissions, leads, clients, vendors, and products.
 * Uses pg full-text search (tsvector/tsquery) with ILIKE fallback.
 * Returns up to 20 results per entity type.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireTenantSession } from '@/lib/auth/tenant-session';
import { requirePermission } from '@/lib/auth/permissions';
import { MODULE } from '@/lib/auth/modules';
import { tenantQuery } from '@/lib/db/client';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tenantSlug = searchParams.get('tenant');
  const q = (searchParams.get('q') ?? '').trim();

  if (!tenantSlug) return NextResponse.json({ error: 'Missing tenant' }, { status: 400 });
  if (!q || q.length < 2) return NextResponse.json({ results: [] });

  const ctx = await requireTenantSession(tenantSlug);
  if (ctx instanceof NextResponse) return ctx;
  const perm = await requirePermission(ctx, MODULE.SEARCH, 'view');
  if (perm instanceof NextResponse) return perm;

  const pattern = `%${q.replace(/[%_\\]/g, '\\$&')}%`;
  const results: Array<{
    type: string;
    id: string;
    title: string;
    subtitle?: string;
    link: string;
  }> = [];

  // Search form submissions — full-text first, ILIKE fallback
  try {
    let subs = await tenantQuery<{ id: string; form_id: string; header_data: Record<string, unknown>; form_name: string }>(
      ctx.schemaName,
      `SELECT fs.id, fs.form_id, fs.header_data, fc.name as form_name
       FROM form_submissions fs
       LEFT JOIN form_configs fc ON fc.id = fs.form_id
       WHERE fs.is_latest = true
         AND to_tsvector('english', fs.header_data::text) @@ plainto_tsquery('english', $1)
       ORDER BY fs.submitted_at DESC
       LIMIT 10`,
      [q]
    );
    if (subs.rows.length === 0) {
      subs = await tenantQuery<{ id: string; form_id: string; header_data: Record<string, unknown>; form_name: string }>(
        ctx.schemaName,
        `SELECT fs.id, fs.form_id, fs.header_data, fc.name as form_name
         FROM form_submissions fs
         LEFT JOIN form_configs fc ON fc.id = fs.form_id
         WHERE fs.is_latest = true
           AND fs.header_data::text ILIKE $1
         ORDER BY fs.submitted_at DESC
         LIMIT 10`,
        [pattern]
      );
    }
    for (const s of subs.rows) {
      const firstVal = s.header_data ? Object.values(s.header_data)[0] : '';
      results.push({
        type: 'submission',
        id: s.id,
        title: `${s.form_name ?? 'Form'}: ${String(firstVal ?? s.id).slice(0, 60)}`,
        subtitle: `Form submission`,
        link: `/${tenantSlug}/form-builder?formId=${s.form_id}&submissionId=${s.id}`,
      });
    }
  } catch { /* table may not exist */ }

  // Search leads — full-text first, ILIKE fallback
  try {
    let leads = await tenantQuery<{ id: string; title: string; contact_name: string; email: string }>(
      ctx.schemaName,
      `SELECT id, title, contact_name, email FROM leads
       WHERE to_tsvector('english', coalesce(title,'') || ' ' || coalesce(contact_name,'') || ' ' || coalesce(email,'')) @@ plainto_tsquery('english', $1)
       LIMIT 10`,
      [q]
    );
    if (leads.rows.length === 0) {
      leads = await tenantQuery<{ id: string; title: string; contact_name: string; email: string }>(
        ctx.schemaName,
        `SELECT id, title, contact_name, email FROM leads
         WHERE title ILIKE $1 OR contact_name ILIKE $1 OR email ILIKE $1
         LIMIT 10`,
        [pattern]
      );
    }
    for (const l of leads.rows) {
      results.push({
        type: 'lead',
        id: l.id,
        title: l.title,
        subtitle: l.contact_name ?? l.email ?? '',
        link: `/${tenantSlug}/leads`,
      });
    }
  } catch { /* ignore */ }

  // Search clients
  try {
    let clients = await tenantQuery<{ id: string; company: string; contact_name: string; email: string }>(
      ctx.schemaName,
      `SELECT id, company, contact_name, email FROM clients
       WHERE to_tsvector('english', coalesce(company,'') || ' ' || coalesce(contact_name,'') || ' ' || coalesce(email,'')) @@ plainto_tsquery('english', $1)
       LIMIT 10`,
      [q]
    );
    if (clients.rows.length === 0) {
      clients = await tenantQuery<{ id: string; company: string; contact_name: string; email: string }>(
        ctx.schemaName,
        `SELECT id, company, contact_name, email FROM clients
         WHERE company ILIKE $1 OR contact_name ILIKE $1 OR email ILIKE $1
         LIMIT 10`,
        [pattern]
      );
    }
    for (const c of clients.rows) {
      results.push({
        type: 'client',
        id: c.id,
        title: c.company,
        subtitle: c.contact_name ?? '',
        link: `/${tenantSlug}/masters`,
      });
    }
  } catch { /* ignore */ }

  // Search vendors
  try {
    let vendors = await tenantQuery<{ id: string; company: string; contact_name: string }>(
      ctx.schemaName,
      `SELECT id, company, contact_name FROM vendors
       WHERE to_tsvector('english', coalesce(company,'') || ' ' || coalesce(contact_name,'')) @@ plainto_tsquery('english', $1)
       LIMIT 5`,
      [q]
    );
    if (vendors.rows.length === 0) {
      vendors = await tenantQuery<{ id: string; company: string; contact_name: string }>(
        ctx.schemaName,
        `SELECT id, company, contact_name FROM vendors
         WHERE company ILIKE $1 OR contact_name ILIKE $1
         LIMIT 5`,
        [pattern]
      );
    }
    for (const v of vendors.rows) {
      results.push({
        type: 'vendor',
        id: v.id,
        title: v.company,
        subtitle: v.contact_name ?? '',
        link: `/${tenantSlug}/masters`,
      });
    }
  } catch { /* ignore */ }

  // Search products
  try {
    let products = await tenantQuery<{ id: string; name: string; sku: string }>(
      ctx.schemaName,
      `SELECT id, name, sku FROM products
       WHERE to_tsvector('english', coalesce(name,'') || ' ' || coalesce(sku,'')) @@ plainto_tsquery('english', $1)
       LIMIT 5`,
      [q]
    );
    if (products.rows.length === 0) {
      products = await tenantQuery<{ id: string; name: string; sku: string }>(
        ctx.schemaName,
        `SELECT id, name, sku FROM products
         WHERE name ILIKE $1 OR sku ILIKE $1
         LIMIT 5`,
        [pattern]
      );
    }
    for (const p of products.rows) {
      results.push({
        type: 'product',
        id: p.id,
        title: p.name,
        subtitle: p.sku ? `SKU: ${p.sku}` : '',
        link: `/${tenantSlug}/inventory`,
      });
    }
  } catch { /* ignore */ }

  return NextResponse.json({ results, query: q, total: results.length });
}
