/**
 * POST /api/runtime/import/[appId]/[tableApiKey]
 * Multipart form: file (CSV or Excel) + fieldMappings (JSON string)
 * Parses the uploaded file and imports rows into the specified table.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { pgPool } from '@/lib/db/client';
import { parseUploadedFile, importRowsToTable } from '@/platform/connectors/file-importer';

type Params = Promise<{ appId: string; tableApiKey: string }>;

export async function POST(req: NextRequest, { params }: { params: Params }) {
  try {
    const { appId, tableApiKey } = await params;
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const tenantSlug = session.user.tenantSlug;
    if (!tenantSlug) return NextResponse.json({ error: 'No tenant' }, { status: 403 });

    // Verify app ownership
    const appCheck = await pgPool.query(
      'SELECT id FROM public.apps WHERE id = $1 AND tenant_slug = $2',
      [appId, tenantSlug],
    );
    if (appCheck.rows.length === 0) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const fieldMappingsRaw = formData.get('fieldMappings') as string | null;

    if (!file) return NextResponse.json({ error: 'file required' }, { status: 400 });
    if (!fieldMappingsRaw) return NextResponse.json({ error: 'fieldMappings required' }, { status: 400 });

    const fieldMappings = JSON.parse(fieldMappingsRaw) as Array<{
      sourceColumn: string;
      targetFieldApiKey: string;
    }>;

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const mimeType = file.type || 'text/csv';

    const { rows } = await parseUploadedFile(buffer, mimeType);

    const result = await importRowsToTable(
      rows,
      fieldMappings,
      tableApiKey,
      appId,
      tenantSlug,
      pgPool,
    );

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
