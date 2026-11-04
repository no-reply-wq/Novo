import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/tenant-session';
import { tenantQuery } from '@/lib/db/client';
import { MODULE } from '@/lib/auth/modules';

export async function GET(req: NextRequest) {
  try {
    const tenantSlug = req.nextUrl.searchParams.get('tenant') ?? '';
    const ctx = await requirePermission(tenantSlug, MODULE.FORM_BUILDER, 'view');
    if (ctx instanceof NextResponse) return ctx;
    const schemaName = ctx.schemaName;

    const [forms, submissions, users, pending] = await Promise.all([
      tenantQuery(schemaName, `SELECT COUNT(*) as count FROM "${schemaName}".form_configs`, []),
      tenantQuery(schemaName, `SELECT COUNT(*) as count FROM "${schemaName}".form_submissions WHERE is_latest = true`, []),
      tenantQuery(schemaName, `SELECT COUNT(*) as count FROM "${schemaName}".users WHERE is_active = true`, []),
      tenantQuery(schemaName, `SELECT COUNT(*) as count FROM "${schemaName}".form_submissions WHERE is_latest = true AND status = 'pending'`, []),
    ]);

    return NextResponse.json({
      totalForms: Number(forms.rows[0]?.count ?? 0),
      totalSubmissions: Number(submissions.rows[0]?.count ?? 0),
      activeUsers: Number(users.rows[0]?.count ?? 0),
      pendingApprovals: Number(pending.rows[0]?.count ?? 0),
    });
  } catch (e) {
    console.error('Dashboard stats error:', e);
    return NextResponse.json({ totalForms: 0, totalSubmissions: 0, activeUsers: 0, pendingApprovals: 0 });
  }
}
