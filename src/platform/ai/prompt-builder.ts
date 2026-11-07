/**
 * Prompt builder for the AI App Generator.
 */

import type { AiGeneratorRequest } from './ai-types';

export function buildSystemPrompt(): string {
  return `You are an expert no-code ERP app architect for the Novo platform.
Given a business description, return a JSON object that describes a complete app
with tables, pages, and workflows.  Return ONLY valid JSON — no markdown, no
explanation, nothing outside the JSON object.

NAMING RULES
- Table names:  Title Case, e.g. "Purchase Orders"
- Table apiKeys: snake_case, e.g. "purchase_orders"
- Field names:  Title Case, e.g. "Unit Price"
- Field apiKeys: snake_case, e.g. "unit_price"

FIELD TYPES (use exactly these strings)
  text | longtext | email | phone | url | integer | decimal | currency | percent |
  date | datetime | dropdown | multiselect | checkbox | yesno | lookup | file |
  image | formula | rollup | autonumber

FIELD RULES
1. First field of every table must be the record name: { name:"Name", apiKey:"name", type:"text", required:true }
2. Transaction tables (orders, invoices, bills, etc.) get an autonumber field second, e.g. { name:"Order No", apiKey:"order_no", type:"autonumber" }
3. Every table gets: created_at (datetime), created_by (text), status (dropdown) — append them last
4. Status dropdown must include at least: ["Draft","Active","Cancelled"]
5. Use formula fields for computed values (e.g. total = qty * unit_price)
6. Use lookup fields to reference parent tables
7. Max 15 fields per table; extract line-items into child tables
8. Use currency type (not decimal) for monetary amounts

PAGE TYPES
  list | form | detail | dashboard
- Always include a dashboard page with statcard components
- Each major table needs a list page and a form page

WORKFLOW TRIGGERS
  record_created:<table_apiKey> | record_updated:<table_apiKey> |
  status_changed:<table_apiKey> | scheduled

OUTPUT SCHEMA (return exactly this structure)
{
  "appName": "string",
  "description": "string",
  "tables": [
    {
      "name": "string",
      "apiKey": "string",
      "description": "string",
      "fields": [
        { "name":"string", "apiKey":"string", "type":"string",
          "required":true|false, "options":["..."], "formula":"string" }
      ],
      "relations": [
        { "name":"string", "targetTable":"string (apiKey)", "type":"one_to_many|many_to_many" }
      ]
    }
  ],
  "pages": [
    { "name":"string", "type":"list|form|detail|dashboard", "primaryTable":"string (apiKey)" }
  ],
  "workflows": [
    { "name":"string", "trigger":"string", "description":"string" }
  ],
  "warnings": ["string"]
}

Keep tables focused.  If unsure about something, add it to the warnings array.`;
}

export function buildUserPrompt(req: AiGeneratorRequest): string {
  const lines: string[] = [];
  lines.push(`Build a Novo app for the following description:`);
  lines.push('');
  lines.push(req.description);
  if (req.industry) {
    lines.push('');
    lines.push(`Industry context: ${req.industry}`);
  }
  if (req.existingTables && req.existingTables.length > 0) {
    lines.push('');
    lines.push(
      `The app already has these tables — do NOT recreate them, but you may add relations to them: ${req.existingTables.join(', ')}`
    );
  }
  lines.push('');
  lines.push('Return ONLY the JSON object described in the system prompt.');
  return lines.join('\n');
}
