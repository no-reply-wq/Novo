/**
 * Google Sheets reader — fetches spreadsheet data via Sheets API v4.
 * Uses raw fetch with service-account JWT auth (no googleapis SDK).
 */

import { pgPool } from '@/lib/db/client';
import { decryptSecret } from '../secrets';
import { NotConfiguredError } from '../secrets/manager';
import { ServiceAccountJson } from './types';
import { getAccessToken } from './auth';

const SHEETS_SCOPE = 'https://www.googleapis.com/auth/spreadsheets.readonly';
const SHEETS_BASE = 'https://sheets.googleapis.com/v4/spreadsheets';

// ─── Internal helpers ──────────────────────────────────────────────────────────

async function loadServiceAccount(tenantSlug: string): Promise<ServiceAccountJson> {
  const result = await pgPool.query<{ config: Record<string, string> }>(
    `SELECT config FROM platform.integration_configs
     WHERE tenant_slug = $1 AND type = 'sheets' AND enabled = true
     LIMIT 1`,
    [tenantSlug]
  );

  if (result.rows.length === 0) {
    throw new NotConfiguredError(
      `No enabled Sheets integration found for tenant: ${tenantSlug}`
    );
  }

  const raw = result.rows[0].config;
  if (!raw['serviceAccountJson']) {
    throw new NotConfiguredError(
      `Sheets integration for tenant "${tenantSlug}" is missing serviceAccountJson`
    );
  }

  const decrypted = decryptSecret(raw['serviceAccountJson'], tenantSlug);
  try {
    return JSON.parse(decrypted) as ServiceAccountJson;
  } catch {
    throw new NotConfiguredError(
      `Sheets integration for tenant "${tenantSlug}" has invalid serviceAccountJson`
    );
  }
}

// ─── Public API ────────────────────────────────────────────────────────────────

/**
 * Read rows from a Google Sheet.
 * Returns the first row as headers, subsequent rows as keyed records.
 */
export async function readSheet(params: {
  tenantSlug: string;
  spreadsheetId: string;
  sheetName?: string;
  range?: string;
}): Promise<{ headers: string[]; rows: Record<string, unknown>[] }> {
  const { tenantSlug, spreadsheetId, sheetName, range } = params;

  const sa = await loadServiceAccount(tenantSlug);
  const token = await getAccessToken(sa, SHEETS_SCOPE);

  // Build A1 notation range: "SheetName!A:ZZ" or just "A:ZZ"
  const rangeStr = range ?? (sheetName ? `${encodeURIComponent(sheetName)}!A:ZZ` : 'A:ZZ');
  const url = `${SHEETS_BASE}/${spreadsheetId}/values/${rangeStr}`;

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Sheets API error ${response.status}: ${text}`);
  }

  const data = (await response.json()) as {
    values?: unknown[][];
  };

  const values = data.values ?? [];
  if (values.length === 0) {
    return { headers: [], rows: [] };
  }

  const rawHeaders = values[0] as unknown[];
  const headers = rawHeaders.map((h) => String(h ?? ''));

  const rows = values.slice(1).map((rawRow) => {
    const record: Record<string, unknown> = {};
    headers.forEach((header, idx) => {
      record[header] = (rawRow as unknown[])[idx] ?? null;
    });
    return record;
  });

  return { headers, rows };
}

/**
 * List the sheet (tab) names in a spreadsheet.
 */
export async function listSheets(params: {
  tenantSlug: string;
  spreadsheetId: string;
}): Promise<string[]> {
  const { tenantSlug, spreadsheetId } = params;

  const sa = await loadServiceAccount(tenantSlug);
  const token = await getAccessToken(sa, SHEETS_SCOPE);

  const url = `${SHEETS_BASE}/${spreadsheetId}?fields=sheets.properties.title`;

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Sheets API error ${response.status}: ${text}`);
  }

  const data = (await response.json()) as {
    sheets?: Array<{ properties: { title: string } }>;
  };

  return (data.sheets ?? []).map((s) => s.properties.title);
}
