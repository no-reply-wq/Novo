/**
 * Google Sheets write-back — appends or overwrites rows in a sheet.
 */

import { pgPool } from '@/lib/db/client';
import { decryptSecret } from '../secrets';
import { NotConfiguredError } from '../secrets/manager';
import { ServiceAccountJson } from './types';
import { getAccessToken } from './auth';

const SHEETS_SCOPE = 'https://www.googleapis.com/auth/spreadsheets';
const SHEETS_BASE = 'https://sheets.googleapis.com/v4/spreadsheets';

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

function rowsToValues(rows: Record<string, unknown>[]): unknown[][] {
  if (rows.length === 0) return [];
  const headers = Object.keys(rows[0]);
  return [
    headers,
    ...rows.map((row) => headers.map((h) => row[h] ?? '')),
  ];
}

/**
 * Write rows to a Google Sheet, either appending or overwriting.
 */
export async function writeToSheet(params: {
  tenantSlug: string;
  spreadsheetId: string;
  sheetName: string;
  rows: Record<string, unknown>[];
  mode: 'append' | 'overwrite';
}): Promise<{ updatedRows: number }> {
  const { tenantSlug, spreadsheetId, sheetName, rows, mode } = params;

  if (rows.length === 0) {
    return { updatedRows: 0 };
  }

  const sa = await loadServiceAccount(tenantSlug);
  const token = await getAccessToken(sa, SHEETS_SCOPE);

  const values = rowsToValues(rows);
  const range = `${encodeURIComponent(sheetName)}!A1`;
  const body = JSON.stringify({ values });

  let url: string;
  let method: string;

  if (mode === 'append') {
    url = `${SHEETS_BASE}/${spreadsheetId}/values/${range}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;
    method = 'POST';
  } else {
    url = `${SHEETS_BASE}/${spreadsheetId}/values/${range}?valueInputOption=USER_ENTERED`;
    method = 'PUT';
  }

  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Sheets write error ${response.status}: ${text}`);
  }

  const data = (await response.json()) as {
    updates?: { updatedRows?: number };
    updatedRows?: number;
  };

  const updatedRows =
    data.updates?.updatedRows ?? data.updatedRows ?? rows.length;

  return { updatedRows };
}
