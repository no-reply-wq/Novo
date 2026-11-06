/**
 * CSV / spreadsheet importer for Novo tables.
 *
 * Parses CSV text, detects column types from the first 10 data rows,
 * and inserts records into a target table's runtime schema.
 *
 * No external CSV library — uses a RFC-4180-compliant hand-written parser.
 */

import { pgPool } from '@/lib/db/client';
import { detectFieldType } from './type-detector';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ColumnMapping {
  /** Column letter (A, B, C…) or exact header string. */
  sheetColumn: string;
  /** Field name in the target Novo table. */
  fieldName: string;
  /** Explicit field type override; if omitted, auto-detected. */
  fieldType?: 'text' | 'number' | 'date' | 'boolean';
}

export interface CsvImportConfig {
  headerRow: number; // 1-indexed, default 1
  dataStartRow: number; // default 2
  columnMappings: ColumnMapping[];
}

export interface ImportResult {
  totalRows: number;
  imported: number;
  skipped: number;
  errors: Array<{ row: number; error: string }>;
}

// ─── RFC-4180 CSV parser ──────────────────────────────────────────────────────

/**
 * Parse CSV text into a 2-D string array.
 * Handles quoted fields (including embedded commas and newlines).
 * Returns one array per row; empty rows are included as [].
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  const len = text.length;
  let pos = 0;

  while (pos <= len) {
    const row: string[] = [];

    // Parse all fields in this row
    while (pos <= len) {
      if (pos === len || text[pos] === '\n' || text[pos] === '\r') {
        // End of row
        if (text[pos] === '\r' && text[pos + 1] === '\n') pos++; // CRLF
        pos++;
        break;
      }

      if (text[pos] === '"') {
        // Quoted field
        pos++; // skip opening quote
        let field = '';
        while (pos < len) {
          if (text[pos] === '"') {
            if (text[pos + 1] === '"') {
              // Escaped quote
              field += '"';
              pos += 2;
            } else {
              // Closing quote
              pos++;
              break;
            }
          } else {
            field += text[pos];
            pos++;
          }
        }
        row.push(field);
        // skip trailing comma
        if (text[pos] === ',') pos++;
      } else {
        // Unquoted field — read until comma or newline
        let field = '';
        while (pos < len && text[pos] !== ',' && text[pos] !== '\n' && text[pos] !== '\r') {
          field += text[pos];
          pos++;
        }
        row.push(field.trim());
        if (text[pos] === ',') pos++;
      }
    }

    if (pos > len && row.length === 0) break;
    rows.push(row);
  }

  return rows;
}

// ─── Type coercion ────────────────────────────────────────────────────────────

function coerce(
  raw: string,
  fieldType: 'text' | 'number' | 'date' | 'boolean'
): string | number | boolean | null {
  const v = raw.trim();
  if (v === '') return null;

  switch (fieldType) {
    case 'number': {
      const n = Number(v.replace(/,/g, ''));
      if (Number.isNaN(n)) throw new Error(`Expected number, got "${v}"`);
      return n;
    }
    case 'boolean': {
      const lower = v.toLowerCase();
      if (['true', 'yes', '1', 'y'].includes(lower)) return true;
      if (['false', 'no', '0', 'n'].includes(lower)) return false;
      throw new Error(`Expected boolean, got "${v}"`);
    }
    case 'date': {
      const d = new Date(v);
      if (isNaN(d.getTime())) throw new Error(`Expected date, got "${v}"`);
      return d.toISOString();
    }
    default:
      return v;
  }
}

// ─── Column resolution ────────────────────────────────────────────────────────

/** Convert a column letter (A, B, AA…) to a 0-based index. */
function letterToIndex(letter: string): number {
  let idx = 0;
  for (const ch of letter.toUpperCase()) {
    idx = idx * 26 + (ch.charCodeAt(0) - 64);
  }
  return idx - 1;
}

/** Resolve a sheetColumn spec to a 0-based column index given the header row. */
function resolveColumn(sheetColumn: string, headers: string[]): number {
  // If it looks like a column letter (A, B, AA …)
  if (/^[A-Za-z]+$/.test(sheetColumn)) {
    return letterToIndex(sheetColumn);
  }
  // Otherwise treat as a header name
  const idx = headers.findIndex((h) => h === sheetColumn);
  if (idx === -1) throw new Error(`Column "${sheetColumn}" not found in headers`);
  return idx;
}

// ─── Auto-detect column types from sample rows ────────────────────────────────

function autoDetectType(values: string[]): 'text' | 'number' | 'date' | 'boolean' {
  const sample = values.filter((v) => v.trim() !== '').slice(0, 10);
  if (sample.length === 0) return 'text';
  // Use existing type-detector
  const detected = detectFieldType('', sample);
  if (detected === 'integer' || detected === 'decimal' || detected === 'currency') return 'number';
  if (detected === 'date' || detected === 'datetime') return 'date';
  if (detected === 'checkbox') return 'boolean';
  return 'text';
}

// ─── Main import function ─────────────────────────────────────────────────────

/**
 * Import CSV content into a Novo runtime table.
 *
 * @param csvContent  Raw CSV string.
 * @param config      Import configuration (header/data rows, column mappings).
 * @param targetTableId  UUID of the destination table.
 * @param tenantSlug  Tenant identifier.
 */
export async function importFromCSV(
  csvContent: string,
  config: CsvImportConfig,
  targetTableId: string,
  tenantSlug: string
): Promise<ImportResult> {
  const headerRow = config.headerRow ?? 1;
  const dataStartRow = config.dataStartRow ?? 2;

  const allRows = parseCsv(csvContent);

  // Extract header row (1-indexed → 0-indexed)
  const headers: string[] = allRows[headerRow - 1] ?? [];

  // Resolve column indices and detect types
  const resolvedMappings = config.columnMappings.map((m) => {
    const colIdx = resolveColumn(m.sheetColumn, headers);
    let fieldType = m.fieldType;
    if (!fieldType) {
      // Auto-detect from sample values
      const sampleValues = allRows
        .slice(dataStartRow - 1, dataStartRow - 1 + 10)
        .map((r) => r[colIdx] ?? '');
      fieldType = autoDetectType(sampleValues);
    }
    return { ...m, colIdx, resolvedFieldType: fieldType };
  });

  // Data rows (1-indexed → 0-indexed)
  const dataRows = allRows.slice(dataStartRow - 1);

  const result: ImportResult = {
    totalRows: dataRows.length,
    imported: 0,
    skipped: 0,
    errors: [],
  };

  const schema = `tenant_${tenantSlug.replace(/-/g, '_')}`;

  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i];
    const rowNumber = dataStartRow + i;

    // Skip entirely empty rows
    if (row.every((cell) => cell.trim() === '')) {
      result.skipped++;
      continue;
    }

    const record: Record<string, string | number | boolean | null> = {};
    let hasError = false;

    for (const mapping of resolvedMappings) {
      const raw = row[mapping.colIdx] ?? '';
      try {
        record[mapping.fieldName] = coerce(raw, mapping.resolvedFieldType);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        result.errors.push({ row: rowNumber, error: `Field "${mapping.fieldName}": ${msg}` });
        hasError = true;
        break;
      }
    }

    if (hasError) {
      result.skipped++;
      continue;
    }

    // Insert into the runtime table
    const fields = Object.keys(record);
    const values = Object.values(record);
    const placeholders = fields.map((_, idx) => `$${idx + 1}`).join(', ');
    const columnList = fields.map((f) => `"${f}"`).join(', ');

    try {
      await pgPool.query(
        `INSERT INTO ${schema}."${targetTableId}" (${columnList}) VALUES (${placeholders})`,
        values
      );
      result.imported++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      result.errors.push({ row: rowNumber, error: `DB insert failed: ${msg}` });
      result.skipped++;
    }
  }

  return result;
}
