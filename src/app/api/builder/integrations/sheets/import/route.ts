/**
 * POST /api/builder/integrations/sheets/import
 *
 * One-click Google Sheets import — reads the spreadsheet and creates
 * table definitions + data rows in the builder.
 *
 * Body:
 *   { spreadsheetId, sheetName?, detectTypes?, createRelations?, appId }
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireSessionTenant } from '@/lib/auth/tenant-session';
import { pgPool } from '@/lib/db/client';
import { importSpreadsheet } from '@/platform/integrations/sheets/importer';
import { NotConfiguredError } from '@/platform/integrations/secrets/manager';
import type { SheetImportOptions } from '@/platform/integrations/sheets/types';

interface ImportRequestBody {
  spreadsheetId: string;
  sheetName?: string;
  detectTypes?: boolean;
  createRelations?: boolean;
  appId: string;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ctx = await requireSessionTenant();
  if (ctx instanceof NextResponse) return ctx;

  let body: ImportRequestBody;
  try {
    body = (await req.json()) as ImportRequestBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { spreadsheetId, sheetName, detectTypes, createRelations, appId } = body;
  const tenantSlug = ctx.tenant.slug;

  if (!spreadsheetId || !appId) {
    return NextResponse.json(
      { error: 'spreadsheetId and appId are required' },
      { status: 400 }
    );
  }

  const options: SheetImportOptions = {
    spreadsheetId,
    ...(sheetName ? { sheetName } : {}),
    detectTypes: detectTypes !== false,
    createRelations: createRelations === true,
  };

  const db = await pgPool.connect();
  try {
    const result = await importSpreadsheet({ tenantSlug, appId, options, db });
    return NextResponse.json({
      tablesCreated: result.tablesCreated.map((t) => ({
        name: t.name,
        slug: t.slug,
        fieldCount: t.fields.length,
        rowCount: t.rows.length,
      })),
      warnings: result.warnings,
    });
  } catch (err) {
    if (err instanceof NotConfiguredError) {
      return NextResponse.json({ error: err.message }, { status: 422 });
    }
    console.error('[sheets/import]', err);
    return NextResponse.json({ error: 'Import failed' }, { status: 500 });
  } finally {
    db.release();
  }
}
