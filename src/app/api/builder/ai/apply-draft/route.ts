/**
 * POST /api/builder/ai/apply-draft
 */
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { pgPool } from '@/lib/db/client';
import { v4 as uuid } from 'uuid';
import type { AiGeneratorDraft, AiTableDraft } from '@/platform/ai/ai-types';

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const tenantSlug = ((session.user as Record<string, unknown>).tenantSlug as string) ?? '';
  if (!tenantSlug) return NextResponse.json({ error: 'Tenant not found in session' }, { status: 403 });
  const userId = ((session.user as Record<string, unknown>).id as string) ?? session.user.email ?? 'unknown';
  const draft = (await req.json().catch(() => null)) as AiGeneratorDraft | null;
  if (!draft || typeof draft.appName !== 'string' || !Array.isArray(draft.tables))
    return NextResponse.json({ error: 'Invalid draft payload' }, { status: 422 });

  const appId = uuid();
  try {
    await pgPool.query(
      `INSERT INTO platform.apps (id, tenant_slug, name, slug, description, icon, created_by) VALUES ($1, $2, $3, $4, $5, 'grid', $6)`,
      [appId, tenantSlug, draft.appName, slugify(draft.appName), draft.description ?? '', userId]);
    for (const table of draft.tables as AiTableDraft[]) {
      const tableId = uuid();
      await pgPool.query(
        `INSERT INTO platform.app_tables (id, app_id, tenant_slug, name, api_key, description) VALUES ($1, $2, $3, $4, $5, $6)`,
        [tableId, appId, tenantSlug, table.name, table.apiKey, table.description ?? '']);
      let pos = 0;
      for (const field of table.fields) {
        await pgPool.query(
          `INSERT INTO platform.app_fields (id, table_id, app_id, tenant_slug, name, api_key, type, required, position) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [uuid(), tableId, appId, tenantSlug, field.name, field.apiKey, field.type, field.required ?? false, pos++]);
      }
    }
    return NextResponse.json({ appId }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 });
  }
}
