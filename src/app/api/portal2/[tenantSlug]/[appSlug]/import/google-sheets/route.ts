/**
 * POST /api/portal2/[tenantSlug]/[appSlug]/import/google-sheets
 * Import rows from a public Google Sheets URL into a tenant table.
 */
import { NextRequest, NextResponse } from 'next/server';
import { pgPool } from '@/lib/db/client';

type Params = Promise<{ tenantSlug: string; appSlug: string }>;

function extractSheetId(url: string): string | null {
  const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  return match ? match[1] : null;
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    // Simple RFC 4180-compatible split (handles quoted commas)
    const cols: string[] = [];
    let cur = '';
    let inQuote = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuote && line[i + 1] === '"') { cur += '"'; i++; }
        else { inQuote = !inQuote; }
      } else if (ch === ',' && !inQuote) {
        cols.push(cur); cur = '';
      } else {
        cur += ch;
      }
    }
    cols.push(cur);
    rows.push(cols);
  }
  return rows;
}

function slugifyColumn(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/, '').slice(0, 60) || 'col';
}

interface ImportBody {
  sheetUrl: string;
  tableName: string;
  hasHeader: boolean;
}

export async function POST(req: NextRequest, { params }: { params: Params }) {
  const { tenantSlug } = await params;

  let body: ImportBody;
  try {
    body = (await req.json()) as ImportBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { sheetUrl, tableName, hasHeader } = body;

  if (!sheetUrl || !tableName) {
    return NextResponse.json({ error: 'sheetUrl and tableName are required' }, { status: 400 });
  }

  // Validate table name
  if (!/^[a-z][a-z0-9_]{0,59}$/.test(tableName)) {
    return NextResponse.json(
      { error: 'tableName must start with a letter and contain only a-z, 0-9, _' },
      { status: 400 },
    );
  }

  const sheetId = extractSheetId(sheetUrl);
  if (!sheetId) {
    return NextResponse.json({ error: 'Could not parse spreadsheet ID from URL' }, { status: 400 });
  }

  const csvUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=0`;

  let csvText: string;
  try {
    const res = await fetch(csvUrl);
    if (!res.ok) {
      return NextResponse.json(
        { error: `Failed to fetch sheet (${res.status}). Make sure the sheet is public.` },
        { status: 400 },
      );
    }
    csvText = await res.text();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Fetch error: ${message}` }, { status: 500 });
  }

  const rows = parseCsv(csvText);
  if (rows.length === 0) {
    return NextResponse.json({ imported: 0, columns: [] });
  }

  let columns: string[];
  let dataRows: string[][];

  if (hasHeader) {
    columns = rows[0].map(slugifyColumn);
    dataRows = rows.slice(1);
  } else {
    columns = rows[0].map((_, i) => `col_${i + 1}`);
    dataRows = rows;
  }

  const schemaName = `tenant_${tenantSlug}`;
  const colDefs = columns.map((c) => `"${c}" TEXT`).join(', ');

  const client = await pgPool.connect();
  try {
    // Create table if needed
    await client.query(
      `CREATE TABLE IF NOT EXISTS "${schemaName}"."${tableName}" (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), ${colDefs}, created_at TIMESTAMPTZ DEFAULT NOW())`,
    );

    let imported = 0;
    for (const row of dataRows) {
      if (row.every((c) => c.trim() === '')) continue;
      const vals = columns.map((_, i) => row[i] ?? null);
      const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');
      const colList = columns.map((c) => `"${c}"`).join(', ');
      await client.query(
        `INSERT INTO "${schemaName}"."${tableName}" (${colList}) VALUES (${placeholders})`,
        vals,
      );
      imported++;
    }

    return NextResponse.json({ imported, columns });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  } finally {
    client.release();
  }
}
