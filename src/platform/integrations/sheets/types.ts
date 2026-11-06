/**
 * Type definitions for the Google Sheets connector.
 */

export interface SheetsConnectorConfig {
  type: 'sheets';
  serviceAccountJson: string; // encrypted JSON key
  spreadsheetId?: string;
}

export interface SheetImportOptions {
  spreadsheetId: string;
  sheetName?: string; // defaults to first sheet
  headerRow?: number; // defaults to 1
  startRow?: number; // defaults to 2
  detectTypes?: boolean; // auto-detect field types from values
  createRelations?: boolean; // detect lookup columns (e.g. "Supplier Name" → lookup to suppliers table)
}

export interface ImportedTableField {
  name: string;
  apiKey: string;
  type: string;
  options?: string[]; // for dropdown — detected unique values
}

export interface ImportedTable {
  name: string;
  slug: string;
  fields: ImportedTableField[];
  rows: Record<string, unknown>[];
}

export interface ServiceAccountJson {
  type: string;
  project_id: string;
  private_key_id: string;
  private_key: string;
  client_email: string;
  client_id: string;
  auth_uri: string;
  token_uri: string;
}
