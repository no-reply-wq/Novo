/**
 * Google Sheets connector — read and write rows using a service account.
 */

import { google } from 'googleapis';

export interface GoogleSheetsConfig {
  /** Secret name holding the full service account JSON string */
  serviceAccountJsonSecret: string;
}

async function getSheetsClient(
  config: GoogleSheetsConfig,
  secretGetter: (name: string) => Promise<string>,
) {
  const rawJson = await secretGetter(config.serviceAccountJsonSecret);
  const credentials = JSON.parse(rawJson) as Record<string, unknown>;

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  return google.sheets({ version: 'v4', auth });
}

/**
 * Read a range from a Google Sheet.
 * Returns headers (first row) and rows as key-value objects.
 */
export async function readSheet(
  config: GoogleSheetsConfig,
  spreadsheetId: string,
  range: string,
  secretGetter: (name: string) => Promise<string>,
): Promise<{ headers: string[]; rows: Record<string, string>[] }> {
  const sheets = await getSheetsClient(config, secretGetter);

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range,
  });

  const values = response.data.values ?? [];
  if (values.length === 0) return { headers: [], rows: [] };

  const headers = (values[0] ?? []).map(String);
  const rows = values.slice(1).map((row) => {
    const record: Record<string, string> = {};
    headers.forEach((header, i) => {
      record[header] = row[i] !== undefined ? String(row[i]) : '';
    });
    return record;
  });

  return { headers, rows };
}

/**
 * Write rows to a Google Sheet range (overwrites existing data at range).
 */
export async function writeSheet(
  config: GoogleSheetsConfig,
  spreadsheetId: string,
  range: string,
  rows: Array<Record<string, unknown>>,
  secretGetter: (name: string) => Promise<string>,
): Promise<{ updatedRows: number }> {
  if (rows.length === 0) return { updatedRows: 0 };

  const sheets = await getSheetsClient(config, secretGetter);

  // Use the first row's keys as headers
  const headers = Object.keys(rows[0]);
  const values: unknown[][] = [
    headers,
    ...rows.map((row) => headers.map((h) => row[h] ?? '')),
  ];

  const response = await sheets.spreadsheets.values.update({
    spreadsheetId,
    range,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values },
  });

  return { updatedRows: response.data.updatedRows ?? rows.length };
}
