/**
 * Google Sheets import wizard — one-click import of a Google Sheet into Novo tables.
 */

import type { Pool } from 'pg';
import type { GoogleSheetsConfig } from './google-sheets';
import { readSheet } from './google-sheets';

export interface SheetImportResult {
  tableApiKey: string;
  columnsDetected: Array<{ name: string; detectedType: string; apiKey: string }>;
  rowsImported: number;
  errors: string[];
}

type NovoFieldType = 'text' | 'number' | 'date';

function detectType(values: string[]): NovoFieldType {
  const sample = values.slice(0, 10).filter((v) => v !== '');
  if (sample.length === 0) return 'text';

  const allNumeric = sample.every((v) => !isNaN(Number(v)) && v.trim() !== '');
  if (allNumeric) return 'number';

  const isoDateRe = /^\d{4}-\d{2}-\d{2}(T.*)?$/;
  const allDates = sample.every((v) => isoDateRe.test(v.trim()));
  if (allDates) return 'date';

  return 'text';
}

function toApiKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 60);
}

/**
 * Import a Google Sheet into a Novo table.
 * If targetTableApiKey is empty, creates a new table named after the sheetName.
 */
export async function importSheetToTable(
  config: GoogleSheetsConfig,
  spreadsheetId: string,
  sheetName: string,
  targetTableApiKey: string,
  appId: string,
  tenantSlug: string,
  pgPool: Pool,
  secretGetter: (name: string) => Promise<string>,
): Promise<SheetImportResult> {
  const errors: string[] = [];

  // Read sheet
  const { headers, rows } = await readSheet(
    config,
    spreadsheetId,
    `${sheetName}!A1:ZZ`,
    secretGetter,
  );

  if (headers.length === 0) {
    return {
      tableApiKey: targetTableApiKey,
      columnsDetected: [],
      rowsImported: 0,
      errors: ['Sheet is empty'],
    };
  }

  // Detect column types from first 10 data rows
  const columnsDetected = headers.map((header) => {
    const colValues = rows.map((row) => row[header] ?? '');
    const detectedType = detectType(colValues);
    return { name: header, detectedType, apiKey: toApiKey(header) };
  });

  const schemaName = `tenant_${tenantSlug}`;

  // Resolve or create table
  let tableKey = targetTableApiKey;
  if (!tableKey) {
    tableKey = toApiKey(sheetName);
    // Create table if not exists
    await pgPool.query(
      `CREATE TABLE IF NOT EXISTS "${schemaName}"."${tableKey}" (
        _id SERIAL PRIMARY KEY,
        _created_at TIMESTAMPTZ DEFAULT now()
      )`,
    );
  }

  // Add columns (ignore if already exists)
  for (const col of columnsDetected) {
    const pgType = col.detectedType === 'number'
      ? 'NUMERIC'
      : col.detectedType === 'date'
      ? 'DATE'
      : 'TEXT';

    try {
      await pgPool.query(
        `ALTER TABLE "${schemaName}"."${tableKey}" ADD COLUMN IF NOT EXISTS "${col.apiKey}" ${pgType}`,
      );
    } catch (err) {
      errors.push(`Column "${col.apiKey}": ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Insert rows
  let rowsImported = 0;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const cols = columnsDetected.map((c) => c.apiKey);
    const vals = columnsDetected.map((c) => {
      const raw = row[c.name] ?? null;
      if (raw === '' || raw === null) return null;
      if (c.detectedType === 'number') return isNaN(Number(raw)) ? null : Number(raw);
      return raw;
    });

    if (cols.length === 0) continue;

    const colList = cols.map((c) => `"${c}"`).join(', ');
    const placeholders = vals.map((_, idx) => `$${idx + 1}`).join(', ');

    try {
      await pgPool.query(
        `INSERT INTO "${schemaName}"."${tableKey}" (${colList}) VALUES (${placeholders})`,
        vals,
      );
      rowsImported++;
    } catch (err) {
      errors.push(`Row ${i + 2}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return { tableApiKey: tableKey, columnsDetected, rowsImported, errors };
}
