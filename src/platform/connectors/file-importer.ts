/**
 * File importer — parse CSV / Excel buffers and import rows into Novo tables.
 */

import Papa from 'papaparse';
import ExcelJS from 'exceljs';
import type { Pool } from 'pg';

// ─── Parse ────────────────────────────────────────────────────────────────────

export async function parseUploadedFile(
  buffer: Buffer,
  mimeType: string,
): Promise<{ headers: string[]; rows: Record<string, unknown>[]; totalRows: number }> {
  if (mimeType === 'text/csv' || mimeType === 'text/plain') {
    return parseCsv(buffer);
  }
  if (
    mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
    mimeType === 'application/vnd.ms-excel'
  ) {
    return parseExcel(buffer);
  }
  throw new Error(`Unsupported file type: ${mimeType}`);
}

function parseCsv(buffer: Buffer): { headers: string[]; rows: Record<string, unknown>[]; totalRows: number } {
  const text = buffer.toString('utf-8');
  const result = Papa.parse<Record<string, unknown>>(text, {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: false,
  });

  const headers = result.meta.fields ?? [];
  const rows = result.data;
  return { headers, rows, totalRows: rows.length };
}

async function parseExcel(buffer: Buffer): Promise<{ headers: string[]; rows: Record<string, unknown>[]; totalRows: number }> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  const worksheet = workbook.worksheets[0];
  if (!worksheet) return { headers: [], rows: [], totalRows: 0 };

  const allRows: unknown[][] = [];
  worksheet.eachRow((row) => {
    allRows.push(row.values as unknown[]);
  });

  if (allRows.length === 0) return { headers: [], rows: [], totalRows: 0 };

  // ExcelJS row.values is 1-indexed (index 0 is null)
  const rawHeaders = (allRows[0] as unknown[]).slice(1).map((h) => (h !== null && h !== undefined ? String(h) : ''));
  const headers = rawHeaders.filter(Boolean);

  const rows: Record<string, unknown>[] = [];
  for (let i = 1; i < allRows.length; i++) {
    const rawRow = (allRows[i] as unknown[]).slice(1);
    const record: Record<string, unknown> = {};
    headers.forEach((header, idx) => {
      record[header] = rawRow[idx] ?? null;
    });
    rows.push(record);
  }

  return { headers, rows, totalRows: rows.length };
}

// ─── Import ───────────────────────────────────────────────────────────────────

export async function importRowsToTable(
  rows: Record<string, unknown>[],
  fieldMappings: Array<{ sourceColumn: string; targetFieldApiKey: string }>,
  tableApiKey: string,
  appId: string,
  tenantSlug: string,
  pgPool: Pool,
): Promise<{ imported: number; errors: Array<{ row: number; error: string }> }> {
  const schemaName = `tenant_${tenantSlug}`;
  let imported = 0;
  const errors: Array<{ row: number; error: string }> = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const cols = fieldMappings.map((m) => `"${m.targetFieldApiKey}"`).join(', ');
    const vals = fieldMappings.map((m) => {
      const v = row[m.sourceColumn];
      return v !== undefined ? v : null;
    });
    const placeholders = vals.map((_, idx) => `$${idx + 1}`).join(', ');

    try {
      await pgPool.query(
        `INSERT INTO "${schemaName}"."${tableApiKey}" (${cols}) VALUES (${placeholders})`,
        vals,
      );
      imported++;
    } catch (err) {
      errors.push({ row: i + 2, error: err instanceof Error ? err.message : String(err) });
    }
  }

  return { imported, errors };
}
