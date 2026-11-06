/**
 * One-click Google Sheets importer.
 * Reads one or all sheets, detects types, creates table definitions,
 * inserts row data, and optionally wires lookup relations.
 */

import type { PoolClient } from 'pg';
import { readSheet, listSheets } from './reader';
import { detectFieldType } from './type-detector';
import type { SheetImportOptions, ImportedTable, ImportedTableField } from './types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

function apiKey(name: string): string {
  return slugify(name);
}

/** Check whether a table with this slug exists in the builder config. */
async function tableExists(slug: string, appId: string, db: PoolClient): Promise<boolean> {
  const result = await db.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM builder.tables
     WHERE slug = $1 AND app_id = $2`,
    [slug, appId]
  );
  return parseInt(result.rows[0]?.count ?? '0', 10) > 0;
}

/**
 * Find if another table with a matching name exists (for relation detection).
 * Returns the slug of the target table, or null.
 */
async function findRelationTarget(
  fieldName: string,
  appId: string,
  db: PoolClient
): Promise<string | null> {
  // "Supplier Name" → look for a "suppliers" table
  const words = fieldName.toLowerCase().split(/\s+/);
  if (words.length < 2) return null;

  // Drop the last word (usually "name", "id", "code") to get the entity name
  const entity = slugify(words.slice(0, -1).join(' '));
  const result = await db.query<{ slug: string }>(
    `SELECT slug FROM builder.tables WHERE slug = $1 AND app_id = $2 LIMIT 1`,
    [entity, appId]
  );
  return result.rows[0]?.slug ?? null;
}

// ─── Core ──────────────────────────────────────────────────────────────────────

async function importSheet(params: {
  tenantSlug: string;
  appId: string;
  spreadsheetId: string;
  sheetName: string;
  options: SheetImportOptions;
  db: PoolClient;
}): Promise<{ table: ImportedTable; warnings: string[] }> {
  const { tenantSlug, appId, spreadsheetId, sheetName, options, db } = params;
  const warnings: string[] = [];

  const { headers, rows } = await readSheet({
    tenantSlug,
    spreadsheetId,
    sheetName,
  });

  if (headers.length === 0) {
    warnings.push(`Sheet "${sheetName}" is empty — skipped`);
    return {
      table: { name: sheetName, slug: slugify(sheetName), fields: [], rows: [] },
      warnings,
    };
  }

  // ── Detect field types ───────────────────────────────────────────────────────
  const fields: ImportedTableField[] = [];
  const skipped: string[] = [];

  for (const header of headers) {
    if (!header.trim()) {
      skipped.push(`(blank column at position ${headers.indexOf(header) + 1})`);
      continue;
    }

    const columnValues = rows.map((r) => r[header]);
    let detected: { type: string; options?: string[] };

    if (options.detectTypes !== false) {
      detected = detectFieldType(header, columnValues);
    } else {
      detected = { type: 'text' };
    }

    // Check for relation
    let finalType = detected.type;
    if (options.createRelations && (detected.type === 'text' || detected.type === 'dropdown')) {
      const target = await findRelationTarget(header, appId, db);
      if (target) {
        finalType = 'lookup';
        warnings.push(
          `Column "${header}" looks like a relation to table "${target}" — created as lookup`
        );
      }
    }

    fields.push({
      name: header,
      apiKey: apiKey(header),
      type: finalType,
      ...(detected.options ? { options: detected.options } : {}),
    });
  }

  if (skipped.length > 0) {
    warnings.push(`Skipped columns with blank headers: ${skipped.join(', ')}`);
  }

  const tableSlug = slugify(sheetName);

  // ── Upsert table definition ──────────────────────────────────────────────────
  const exists = await tableExists(tableSlug, appId, db);
  if (exists) {
    warnings.push(`Table "${tableSlug}" already exists — skipping definition update`);
  } else {
    await db.query(
      `INSERT INTO builder.tables (app_id, name, slug, schema_def, created_at, updated_at)
       VALUES ($1, $2, $3, $4, NOW(), NOW())`,
      [appId, sheetName, tableSlug, JSON.stringify({ fields })]
    );
  }

  // ── Insert rows ──────────────────────────────────────────────────────────────
  if (rows.length > 0 && fields.length > 0) {
    const columnNames = fields.map((f) => f.apiKey);
    const placeholders = rows.map(
      (_, rowIdx) =>
        `(${columnNames.map((_, colIdx) => `$${rowIdx * columnNames.length + colIdx + 1}`).join(', ')})`
    );
    const values = rows.flatMap((row) => columnNames.map((col) => row[fields.find((f) => f.apiKey === col)!.name] ?? null));

    await db.query(
      `INSERT INTO tenant_${tableSlug} (${columnNames.map((c) => `"${c}"`).join(', ')})
       VALUES ${placeholders.join(', ')}
       ON CONFLICT DO NOTHING`,
      values
    );
  }

  return {
    table: { name: sheetName, slug: tableSlug, fields, rows },
    warnings,
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function importSpreadsheet(params: {
  tenantSlug: string;
  appId: string;
  options: SheetImportOptions;
  db: PoolClient;
}): Promise<{ tablesCreated: ImportedTable[]; warnings: string[] }> {
  const { tenantSlug, appId, options, db } = params;
  const allWarnings: string[] = [];
  const tablesCreated: ImportedTable[] = [];

  // Determine which sheets to import
  let sheetNames: string[];
  if (options.sheetName) {
    sheetNames = [options.sheetName];
  } else {
    sheetNames = await listSheets({ tenantSlug, spreadsheetId: options.spreadsheetId });
    if (sheetNames.length === 0) {
      allWarnings.push('Spreadsheet has no sheets');
      return { tablesCreated, warnings: allWarnings };
    }
  }

  for (const sheetName of sheetNames) {
    const { table, warnings } = await importSheet({
      tenantSlug,
      appId,
      spreadsheetId: options.spreadsheetId,
      sheetName,
      options,
      db,
    });
    tablesCreated.push(table);
    allWarnings.push(...warnings);
  }

  return { tablesCreated, warnings: allWarnings };
}
