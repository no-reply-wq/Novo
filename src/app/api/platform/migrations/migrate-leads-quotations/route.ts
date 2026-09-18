import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { prisma } from '@/lib/db/client';
import { migrateLeads, migrateQuotations } from '@/lib/db/migrations/migrate-leads-quotations-to-form-builder';

/**
 * POST /api/platform/migrations/migrate-leads-quotations
 * Body: { tenantSlug: string, confirm: true }
 *
 * Deliberately per-tenant, not a blanket "run for everyone" sweep like
 * the smaller column migrations — this one copies real business data
 * and genuinely warrants running against one tenant at a time, checked
 * carefully, rather than firing at every tenant in one call.
 *
 * Requires `confirm: true` in the body as a basic guard against
 * triggering this by accident from a stray request.
 */
export async function POST(req: NextRequest) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token?.isPlatformAdmin) {
    return NextResponse.json({ error: 'Platform admin access required' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const { tenantSlug, confirm } = body;
  if (!tenantSlug) return NextResponse.json({ error: 'tenantSlug is required' }, { status: 400 });
  if (confirm !== true) {
    return NextResponse.json({ error: 'This migrates real Leads/Quotations data. Pass { "confirm": true } to proceed.' }, { status: 400 });
  }

  const tenant = await prisma.tenant.findUnique({ where: { slug: tenantSlug } });
  if (!tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });

  try {
    const leadsResult = await migrateLeads(tenant.schemaName);
    const quotationsResult = await migrateQuotations(tenant.schemaName);

    return NextResponse.json({
      success: true,
      leads: { formId: leadsResult.formId, migrated: leadsResult.migrated },
      quotations: { formId: quotationsResult.formId, migrated: quotationsResult.migrated },
      note: 'Original leads/quotations tables and all foreign keys are untouched. Verify the new /custom/leads-migrated and /custom/quotations-migrated tabs show correct data before doing anything further.',
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
