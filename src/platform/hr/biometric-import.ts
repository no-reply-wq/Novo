/**
 * Platform HR — Biometric Attendance Import (spec: gap-agent-w1-auth feature 4)
 */

import { Pool } from 'pg';

export interface BiometricRecord {
  employeeId: string;
  timestamp: Date;
  type: 'in' | 'out';
  deviceId?: string;
}

type ParsedRow = BiometricRecord | null;

/**
 * Parse a CSV buffer from a biometric device.
 *
 * Supported formats:
 *   Format A: ID,Date,Time,Type        → "EMP01,2024-01-15,09:00:00,IN"
 *   Format B: ID,DateTime,Direction    → "EMP01,2024-01-15 09:00:00,IN"
 *   Format C: ID,DateTime,Direction,DeviceID (Format B with optional device column)
 */
export async function parseBiometricCsv(buffer: Buffer): Promise<BiometricRecord[]> {
  const text = buffer.toString('utf-8').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);

  if (lines.length === 0) return [];

  // Skip a header row only when the second column (date/datetime) looks non-numeric
  // A real data row always has a date-like value in col[1] (starts with a digit).
  // A header row has text like "Date", "DateTime", "EmpID", etc.
  const firstCols = lines[0].split(',').map((c) => c.trim());
  const secondCol = firstCols[1] ?? '';
  const isHeaderRow = !/^\d/.test(secondCol); // second column starts with a digit in data rows

  const dataLines = isHeaderRow ? lines.slice(1) : lines;

  const records: BiometricRecord[] = [];
  for (const line of dataLines) {
    const parsed = parseRow(line);
    if (parsed) records.push(parsed);
  }
  return records;
}

function parseRow(line: string): ParsedRow {
  const cols = line.split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
  if (cols.length < 3) return null;

  const employeeId = cols[0];
  if (!employeeId) return null;

  let timestamp: Date | null = null;
  let typeRaw: string = '';
  let deviceId: string | undefined;

  if (cols.length >= 4) {
    // Could be Format A (ID, Date, Time, Type) or Format C (ID, DateTime, Direction, DeviceID)
    // Distinguish: in Format A cols[2] is a time-only value like "09:00:00"
    const col2LooksLikeTime = /^\d{1,2}:\d{2}(:\d{2})?$/.test(cols[2]);
    if (col2LooksLikeTime) {
      // Format A: ID, Date, Time, Type
      timestamp = parseDatetime(`${cols[1]} ${cols[2]}`);
      typeRaw = cols[3];
    } else {
      // Format C: ID, DateTime, Direction, DeviceID
      timestamp = parseDatetime(cols[1]);
      typeRaw = cols[2];
      deviceId = cols[3] || undefined;
    }
  } else {
    // Format B: ID, DateTime, Direction
    timestamp = parseDatetime(cols[1]);
    typeRaw = cols[2];
  }

  if (!timestamp || isNaN(timestamp.getTime())) return null;

  const type = normaliseType(typeRaw);
  if (!type) return null;

  return { employeeId, timestamp, type, deviceId };
}

function parseDatetime(raw: string): Date | null {
  const cleaned = raw.replace('T', ' ').replace(/\//g, '-');
  const d = new Date(cleaned);
  return isNaN(d.getTime()) ? null : d;
}

function normaliseType(raw: string): 'in' | 'out' | null {
  const v = raw.trim().toUpperCase();
  if (['IN', 'ENTRY', 'CHECK-IN', 'CHECKIN', '1', 'I'].includes(v)) return 'in';
  if (['OUT', 'EXIT', 'CHECK-OUT', 'CHECKOUT', '0', 'O'].includes(v)) return 'out';
  return null;
}

export interface ImportResult {
  imported: number;
  skipped: number;
  errors: string[];
}

export async function importBiometricRecords(
  records: BiometricRecord[],
  tableApiKey: string,
  tenantSlug: string,
  pgPool: Pool,
): Promise<ImportResult> {
  let imported = 0;
  let skipped = 0;
  const errors: string[] = [];

  const { rows: tenantRows } = await pgPool.query<{ schema_name: string }>(
    `SELECT schema_name FROM platform.tenants WHERE slug = $1 LIMIT 1`,
    [tenantSlug],
  );

  if (tenantRows.length === 0) {
    return { imported: 0, skipped: records.length, errors: [`Tenant not found: ${tenantSlug}`] };
  }

  const schema = tenantRows[0].schema_name;

  const { rows: tableRows } = await pgPool.query<{ table_name: string }>(
    `SELECT table_name FROM platform.table_definitions WHERE api_key = $1 AND tenant_slug = $2 LIMIT 1`,
    [tableApiKey, tenantSlug],
  );

  if (tableRows.length === 0) {
    return { imported: 0, skipped: records.length, errors: [`Table not found for api_key: ${tableApiKey}`] };
  }

  const tableName = tableRows[0].table_name;

  for (const rec of records) {
    try {
      const result = await pgPool.query(
        `INSERT INTO "${schema}"."${tableName}" (employee_id, punch_time, punch_type, device_id)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (employee_id, punch_time, punch_type) DO NOTHING`,
        [rec.employeeId, rec.timestamp, rec.type, rec.deviceId ?? null],
      );
      if ((result.rowCount ?? 0) > 0) {
        imported++;
      } else {
        skipped++;
      }
    } catch (err) {
      skipped++;
      errors.push(`${rec.employeeId}@${rec.timestamp.toISOString()}: ${(err as Error).message}`);
    }
  }

  return { imported, skipped, errors };
}
