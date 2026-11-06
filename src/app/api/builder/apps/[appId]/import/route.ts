/**
 * POST /api/builder/apps/[appId]/import
 *
 * Accepts multipart/form-data with EITHER:
 *   - file (CSV blob) + targetTableId + optional column mapping JSON
 *   - sheetsUrl (Google Sheets URL) + targetTableId + apiKey + optional column mapping JSON
 *
 * Returns ImportResult: { totalRows, imported, skipped, errors }
 */

import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/tenant-session';
import { MODULE } from '@/lib/auth/modules';
import type { CsvImportConfig } from '@/platform/integrations/sheets/csv-importer';
import { importFromCSV } from '@/platform/integrations/sheets/csv-importer';

export const dynamic = 'force-dynamic';

function extractSpreadsheetId(url: string): string | null {
  const match = /\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/.exec(url);
  return match?.[1] ?? null;
}

interface RouteParams {
  params: Promise<{ appId: string }>;
}

export async function POST(req: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { appId } = await params;
  const tenantSlug = req.nextUrl.searchParams.get('tenant') ?? '';

  const ctx = await requirePermission(tenantSlug, MODULE.TABLES, 'edit');
  if (ctx instanceof NextResponse) return ctx;

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Expected multipart/form-data body' }, { status: 400 });
  }

  const targetTableId = formData.get('targetTableId');
  if (!targetTableId || typeof targetTableId !== 'string') {
    return NextResponse.json({ error: 'Missing required field: targetTableId' }, { status: 400 });
  }

  const columnMappingsRaw = formData.get('columnMappings');
  let columnMappings: CsvImportConfig['columnMappings'] = [];
  if (columnMappingsRaw && typeof columnMappingsRaw === 'string') {
    try {
      columnMappings = JSON.parse(columnMappingsRaw) as CsvImportConfig['columnMappings'];
    } catch {
      return NextResponse.json({ error: 'Invalid columnMappings JSON' }, { status: 400 });
    }
  }

  const headerRow = Number(formData.get('headerRow') ?? '1');
  const dataStartRow = Number(formData.get('dataStartRow') ?? '2');

  const config: CsvImportConfig = {
    headerRow: isNaN(headerRow) ? 1 : headerRow,
    dataStartRow: isNaN(dataStartRow) ? 2 : dataStartRow,
    columnMappings,
  };

  // ── CSV file upload path ──────────────────────────────────────────────────
  const file = formData.get('file');
  if (file && typeof file !== 'string') {
    const blob = file as Blob;
    const contentType = blob.type || 'text/csv';

    if (!['text/csv', 'text/plain', 'application/csv'].includes(contentType) &&
        !contentType.includes('spreadsheet')) {
      return NextResponse.json(
        { error: `Unsupported file type: ${contentType}` },
        { status: 415 }
      );
    }

    const csvContent = await blob.text();
    const result = await importFromCSV(csvContent, config, targetTableId, tenantSlug);
    return NextResponse.json({ appId, targetTableId, ...result });
  }

  // ── Google Sheets URL path ────────────────────────────────────────────────
  const sheetsUrl = formData.get('sheetsUrl');
  if (sheetsUrl && typeof sheetsUrl === 'string') {
    const spreadsheetId = extractSpreadsheetId(sheetsUrl);
    if (!spreadsheetId) {
      return NextResponse.json(
        { error: 'Could not extract spreadsheet ID from URL' },
        { status: 400 }
      );
    }

    const apiKey = formData.get('apiKey');
    if (!apiKey || typeof apiKey !== 'string') {
      return NextResponse.json(
        { error: 'Missing required field: apiKey (Google API key for Sheets access)' },
        { status: 400 }
      );
    }

    const sheetName = (formData.get('sheetName') as string | null) ?? 'Sheet1';
    const range = `${sheetName}!A1:ZZ`;

    // Fetch sheet data via Google Sheets API v4 (public sheets with API key)
    const sheetsApiUrl =
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}` +
      `?key=${encodeURIComponent(apiKey)}`;

    let sheetsData: { values?: string[][] };
    try {
      const sheetsRes = await fetch(sheetsApiUrl);
      if (!sheetsRes.ok) {
        const body = await sheetsRes.text();
        return NextResponse.json(
          { error: `Google Sheets API error ${sheetsRes.status}: ${body.slice(0, 200)}` },
          { status: 502 }
        );
      }
      sheetsData = await sheetsRes.json() as { values?: string[][] };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return NextResponse.json(
        { error: `Failed to fetch Google Sheet: ${msg}` },
        { status: 502 }
      );
    }

    // Convert 2-D array to CSV
    const rows = sheetsData.values ?? [];
    const csvContent = rows
      .map((row) =>
        row
          .map((cell) => {
            const s = String(cell ?? '');
            return s.includes(',') || s.includes('"') || s.includes('\n')
              ? `"${s.replace(/"/g, '""')}"`
              : s;
          })
          .join(',')
      )
      .join('\n');

    const result = await importFromCSV(csvContent, config, targetTableId, tenantSlug);
    return NextResponse.json({ appId, targetTableId, spreadsheetId, ...result });
  }

  return NextResponse.json(
    { error: 'Provide either a "file" (CSV) or a "sheetsUrl" (Google Sheets)' },
    { status: 400 }
  );
}
