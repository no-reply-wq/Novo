/**
 * Script template library — pre-built tenant scripts that can be loaded from
 * the editor as starting points.
 */

import type { ScriptTestCase } from './test-runner.js';

export interface ScriptTemplate {
  id: string;
  name: string;
  description: string;
  category: 'data' | 'notification' | 'integration' | 'report';
  code: string;
  testCases: ScriptTestCase[];
}

// ─── Templates ────────────────────────────────────────────────────────────────

export const SCRIPT_TEMPLATES: ScriptTemplate[] = [
  // ── 1. Send WhatsApp on record create ────────────────────────────────────
  {
    id: 'whatsapp-on-create',
    name: 'Send WhatsApp on record create',
    description: 'Sends a WhatsApp message to a contact when a new record is created.',
    category: 'notification',
    code: `
// Triggered when a new record is created.
// Expects input.record with at least { phone, name } fields.
const record = input.record ?? {};
const phone = record.phone ?? input.phone;
const name = record.name ?? 'Customer';

if (!phone) {
  novo.log('No phone number found — skipping WhatsApp send');
  return { skipped: true };
}

await novo.whatsapp.send(
  String(phone),
  \`Hi \${name}, your record has been created successfully. Thank you!\`
);

novo.log('WhatsApp sent', { to: phone });
return { sent: true, to: phone };
`.trim(),
    testCases: [
      {
        name: 'Sends message when phone is present',
        input: { record: { phone: '+919876543210', name: 'Ravi' } },
        expectedOutput: { sent: true, to: '+919876543210' },
      },
      {
        name: 'Skips when phone is missing',
        input: { record: { name: 'No Phone' } },
        expectedOutput: { skipped: true },
      },
    ],
  },

  // ── 2. Auto-calculate totals ──────────────────────────────────────────────
  {
    id: 'auto-calculate-totals',
    name: 'Auto-calculate totals',
    description: 'Recalculates line-item totals and updates the parent record.',
    category: 'data',
    code: `
// Recalculate the total for all line items of the parent record.
// Expects input.parentId and input.table (line-items table name).
const parentId = input.parentId;
const lineTable = input.table ?? 'order_items';
const parentTable = input.parentTable ?? 'orders';

if (!parentId) throw new Error('input.parentId is required');

const lines = await novo.db.findMany(lineTable, { parent_id: parentId });
const total = lines.reduce((sum, row) => {
  return sum + (Number(row.qty ?? 0) * Number(row.unit_price ?? 0));
}, 0);

await novo.db.update(parentTable, parentId, { total_amount: total });
novo.log('Total updated', { parentId, total, lineCount: lines.length });
return { total, lineCount: lines.length };
`.trim(),
    testCases: [
      {
        name: 'Sums line items correctly',
        input: { parentId: 'ord-1', table: 'order_items', parentTable: 'orders' },
        mockDb: {
          order_items: [
            { id: 'li-1', parent_id: 'ord-1', qty: 2, unit_price: 100 },
            { id: 'li-2', parent_id: 'ord-1', qty: 3, unit_price: 50 },
          ],
          orders: [{ id: 'ord-1', total_amount: 0 }],
        },
        expectedOutput: { total: 350, lineCount: 2 },
      },
      {
        name: 'Throws when parentId missing',
        input: {},
        expectError: true,
      },
    ],
  },

  // ── 3. Sync to Google Sheets (stub) ──────────────────────────────────────
  {
    id: 'sync-google-sheets',
    name: 'Sync to Google Sheets',
    description: 'Pushes rows from a table to a Google Sheets spreadsheet via the Sheets API.',
    category: 'integration',
    code: `
// Sync rows to Google Sheets.
// Requires secrets: SHEETS_API_KEY, SPREADSHEET_ID
// Expects input.table (source table), input.sheetName (target sheet tab)
const apiKey = novo.env('SHEETS_API_KEY') ?? input.apiKey;
const spreadsheetId = novo.env('SPREADSHEET_ID') ?? input.spreadsheetId;
const table = input.table ?? 'records';
const sheetName = input.sheetName ?? 'Sheet1';

if (!apiKey) throw new Error('Secret SHEETS_API_KEY is required');
if (!spreadsheetId) throw new Error('SPREADSHEET_ID secret or input.spreadsheetId is required');

const rows = await novo.db.findMany(table, {}, { limit: 1000 });
if (rows.length === 0) {
  novo.log('No rows to sync');
  return { synced: 0 };
}

const headers = Object.keys(rows[0]);
const values = [headers, ...rows.map((r) => headers.map((h) => r[h] ?? ''))];

const url = \`https://sheets.googleapis.com/v4/spreadsheets/\${spreadsheetId}/values/\${sheetName}!A1:ZZ\${values.length}?valueInputOption=RAW&key=\${apiKey}\`;
const result = await novo.http.post(url, { values }, {
  headers: { 'Content-Type': 'application/json' },
});

novo.log('Sheets sync response', { status: result.status, rowCount: rows.length });
return { synced: rows.length, status: result.status };
`.trim(),
    testCases: [
      {
        name: 'Returns synced count',
        input: { table: 'records', sheetName: 'Data', apiKey: 'test-key', spreadsheetId: 'abc123' },
        mockDb: {
          records: [
            { id: '1', name: 'Alice', amount: 100 },
            { id: '2', name: 'Bob', amount: 200 },
          ],
        },
        // HTTP is mocked to return { status: 200, body: { mock: true } }
        expectedOutput: { synced: 2, status: 200 },
      },
    ],
  },

  // ── 4. Generate auto-number ───────────────────────────────────────────────
  {
    id: 'auto-number',
    name: 'Generate auto-number',
    description: 'Generates a sequential document number (e.g. INV-0042) and saves it on the record.',
    category: 'data',
    code: `
// Generate the next auto-number for a record.
// Expects input.recordId, input.table, input.prefix (e.g. "INV")
const table = input.table ?? 'records';
const prefix = String(input.prefix ?? 'REC');
const recordId = input.recordId;
if (!recordId) throw new Error('input.recordId is required');

// Count existing numbered records to derive the next sequence
const rows = await novo.db.query(
  \`SELECT COUNT(*) AS cnt FROM "\${table}" WHERE auto_number IS NOT NULL\`
);
const count = Number((rows[0] ?? {}).cnt ?? 0);
const seq = String(count + 1).padStart(4, '0');
const autoNumber = \`\${prefix}-\${seq}\`;

await novo.db.update(table, recordId, { auto_number: autoNumber });
novo.log('Auto-number assigned', { autoNumber, recordId });
return { autoNumber };
`.trim(),
    testCases: [
      {
        name: 'Generates first number',
        input: { table: 'invoices', prefix: 'INV', recordId: 'rec-1' },
        mockDb: { invoices: [{ id: 'rec-1', auto_number: null }] },
        expectedOutput: { autoNumber: 'INV-0001' },
      },
    ],
  },

  // ── 5. Send approval reminder ─────────────────────────────────────────────
  {
    id: 'approval-reminder',
    name: 'Send approval reminder',
    description: 'Sends a WhatsApp reminder to approvers for records pending more than N hours.',
    category: 'notification',
    code: `
// Send WhatsApp reminders for approvals pending longer than input.hours (default 24).
const hours = Number(input.hours ?? 24);
const approvalsTable = input.table ?? 'approvals';
const cutoff = new Date(Date.now() - hours * 3600_000).toISOString();

const pending = await novo.db.query(
  \`SELECT * FROM "\${approvalsTable}" WHERE status = 'pending' AND created_at < $1\`,
  [cutoff]
);

novo.log('Pending approvals found', { count: pending.length, olderThanHours: hours });

let sent = 0;
for (const approval of pending) {
  const phone = String(approval.approver_phone ?? '');
  if (!phone) continue;
  await novo.whatsapp.send(phone, \`Reminder: approval #\${approval.id} has been waiting \${hours}+ hours.\`);
  sent++;
}

return { reminded: sent, total: pending.length };
`.trim(),
    testCases: [
      {
        name: 'Sends reminders for pending approvals',
        input: { hours: 1, table: 'approvals' },
        mockDb: {
          approvals: [
            { id: 'a1', status: 'pending', created_at: new Date(0).toISOString(), approver_phone: '+911234567890' },
          ],
        },
        expectedOutput: { reminded: 1, total: 1 },
      },
    ],
  },

  // ── 6. Archive old records ────────────────────────────────────────────────
  {
    id: 'archive-old-records',
    name: 'Archive old records',
    description: 'Marks records older than N days as archived to keep the active table small.',
    category: 'data',
    code: `
// Archive records older than input.days (default 90).
const table = input.table ?? 'records';
const days = Number(input.days ?? 90);
const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();

const result = await novo.db.query(
  \`UPDATE "\${table}" SET archived = TRUE, archived_at = NOW()
   WHERE (archived IS NULL OR archived = FALSE) AND created_at < $1
   RETURNING id\`,
  [cutoff]
);

const archivedCount = result.length;
novo.log('Records archived', { archivedCount, cutoffDate: cutoff });
return { archived: archivedCount };
`.trim(),
    testCases: [
      {
        name: 'Returns archived count (mocked)',
        input: { table: 'orders', days: 90 },
        mockDb: { orders: [] },
        // With mock DB the UPDATE returns [] so archived = 0
        expectedOutput: { archived: 0 },
      },
    ],
  },
];
