/**
 * AI App Generator — takes a natural language description and returns
 * a full GeneratedAppDraft with tables, pages, and workflows.
 */

import { v4 as uuid } from 'uuid';
import { pgPool } from '@/lib/db/client';
import { NotConfiguredError } from '../workflow/errors';
import type {
  AppGenerationRequest,
  GeneratedAppDraft,
  GeneratedTable,
  GeneratedPage,
  GeneratedWorkflow,
} from './types';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-3-5-haiku-20241022';
const MAX_TOKENS = 4096;

const SYSTEM_PROMPT = `You are an expert no-code app builder assistant for Novo platform.
Given a description of a business app, generate a complete app structure as JSON.

The Novo platform supports:
- Tables with fields: text, longtext, email, phone, url, integer, decimal, currency, percent, date, datetime, dropdown, multiselect, checkbox, yesno, lookup (relation), file, image, formula, rollup, autonumber
- Relations: one_to_many, many_to_many between tables
- Pages with components: table (data grid), form (create/edit), statcard (KPI), kanban (card board), chart (bar/line/pie)
- Workflows triggered by: record_created, record_updated, status_changed, scheduled
- Engines: stock (inventory tracking), fulfilment (order fulfillment linking)

Return ONLY valid JSON matching this exact schema:
{
  "app": {
    "name": "string",
    "slug": "string (kebab-case)",
    "description": "string",
    "icon": "string (single emoji)"
  },
  "tables": [
    {
      "name": "string",
      "slug": "string (kebab-case)",
      "description": "string",
      "fields": [
        {
          "name": "string",
          "apiKey": "string (snake_case)",
          "type": "text|longtext|email|phone|url|integer|decimal|currency|percent|date|datetime|dropdown|multiselect|checkbox|yesno|lookup|file|image|formula|rollup|autonumber",
          "required": true|false,
          "options": ["option1", "option2"],
          "formula": "string (only for formula type)"
        }
      ],
      "relations": [
        {
          "name": "string",
          "targetTable": "string (slug of target table)",
          "type": "one_to_many|many_to_many"
        }
      ],
      "hasStock": true|false,
      "hasFulfilment": true|false
    }
  ],
  "pages": [
    {
      "name": "string",
      "slug": "string (kebab-case)",
      "description": "string",
      "components": [
        {
          "type": "table|form|statcard|kanban|chart",
          "title": "string",
          "dataSource": "string (table slug)",
          "config": {}
        }
      ]
    }
  ],
  "workflows": [
    {
      "name": "string",
      "trigger": "string (e.g. record_created:table-slug)",
      "description": "string",
      "steps": ["step description 1", "step description 2"]
    }
  ]
}

Rules:
- Create 3-8 tables that make sense for the app
- Every table needs a name field (text, required) as the first field
- Add autonumber field (e.g. PO-{YYYY}-{0001}) to transaction tables
- Link related tables with lookup fields
- Create a dashboard page (statcards) + list pages for each main table + form pages
- Add 2-3 practical workflows
- Use Indian business context (₹ currency, GST fields where relevant)
- Do not include any explanation, only the JSON object`;

interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface AnthropicResponse {
  content: Array<{ type: string; text: string }>;
  usage: { input_tokens: number; output_tokens: number };
}

function isAnthropicResponse(val: unknown): val is AnthropicResponse {
  if (typeof val !== 'object' || val === null) return false;
  const obj = val as Record<string, unknown>;
  if (!Array.isArray(obj.content)) return false;
  if (typeof obj.usage !== 'object' || obj.usage === null) return false;
  const usage = obj.usage as Record<string, unknown>;
  return typeof usage.input_tokens === 'number' && typeof usage.output_tokens === 'number';
}

function extractJson(text: string): string {
  // Try to extract JSON from markdown code block
  const codeBlockMatch = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
  if (codeBlockMatch) {
    return codeBlockMatch[1].trim();
  }
  // Try to find raw JSON object
  const jsonMatch = /(\{[\s\S]*\})/.exec(text);
  if (jsonMatch) {
    return jsonMatch[1].trim();
  }
  return text.trim();
}

function isGeneratedTable(val: unknown): val is GeneratedTable {
  if (typeof val !== 'object' || val === null) return false;
  const obj = val as Record<string, unknown>;
  return (
    typeof obj.name === 'string' &&
    typeof obj.slug === 'string' &&
    typeof obj.description === 'string' &&
    Array.isArray(obj.fields) &&
    Array.isArray(obj.relations)
  );
}

function isGeneratedPage(val: unknown): val is GeneratedPage {
  if (typeof val !== 'object' || val === null) return false;
  const obj = val as Record<string, unknown>;
  return (
    typeof obj.name === 'string' &&
    typeof obj.slug === 'string' &&
    typeof obj.description === 'string' &&
    Array.isArray(obj.components)
  );
}

function isGeneratedWorkflow(val: unknown): val is GeneratedWorkflow {
  if (typeof val !== 'object' || val === null) return false;
  const obj = val as Record<string, unknown>;
  return (
    typeof obj.name === 'string' &&
    typeof obj.trigger === 'string' &&
    typeof obj.description === 'string' &&
    Array.isArray(obj.steps)
  );
}

interface ParsedDraftContent {
  app: { name: string; slug: string; description: string; icon: string };
  tables: unknown[];
  pages: unknown[];
  workflows: unknown[];
}

function isParsedDraftContent(val: unknown): val is ParsedDraftContent {
  if (typeof val !== 'object' || val === null) return false;
  const obj = val as Record<string, unknown>;
  if (typeof obj.app !== 'object' || obj.app === null) return false;
  const app = obj.app as Record<string, unknown>;
  return (
    typeof app.name === 'string' &&
    typeof app.slug === 'string' &&
    typeof app.description === 'string' &&
    typeof app.icon === 'string' &&
    Array.isArray(obj.tables) &&
    Array.isArray(obj.pages) &&
    Array.isArray(obj.workflows)
  );
}

export async function generateApp(req: AppGenerationRequest): Promise<GeneratedAppDraft> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new NotConfiguredError('ANTHROPIC_API_KEY');
  }

  const messages: AnthropicMessage[] = [
    {
      role: 'user',
      content: `Generate a complete Novo app structure for the following description:\n\n${req.description}`,
    },
  ];

  const response = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: SYSTEM_PROMPT,
      messages,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error');
    throw new Error(`Anthropic API error ${response.status}: ${errorText}`);
  }

  const rawResponse: unknown = await response.json();
  if (!isAnthropicResponse(rawResponse)) {
    throw new Error('Unexpected response structure from Anthropic API');
  }

  const textContent = rawResponse.content.find((c) => c.type === 'text');
  if (!textContent) {
    throw new Error('No text content in Anthropic API response');
  }

  const jsonStr = extractJson(textContent.text);
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr);
  } catch (e) {
    throw new Error(`AI returned invalid JSON: ${e instanceof Error ? e.message : String(e)}`);
  }

  if (!isParsedDraftContent(parsed)) {
    throw new Error(
      'AI response missing required fields: app.name, app.slug, app.description, app.icon, tables[], pages[], workflows[]'
    );
  }

  const tables = parsed.tables.filter(isGeneratedTable);
  const pages = parsed.pages.filter(isGeneratedPage);
  const workflows = parsed.workflows.filter(isGeneratedWorkflow);

  if (tables.length === 0) {
    throw new Error('AI response contains no valid tables');
  }

  const draftId = uuid();
  const now = new Date().toISOString();

  const draft: GeneratedAppDraft = {
    id: draftId,
    tenantSlug: req.tenantSlug,
    status: 'draft',
    description: req.description,
    app: parsed.app,
    tables,
    pages,
    workflows,
    generatedAt: now,
    promptTokens: rawResponse.usage.input_tokens,
    completionTokens: rawResponse.usage.output_tokens,
  };

  await pgPool.query(
    `INSERT INTO platform.app_generation_drafts
       (id, tenant_slug, user_id, description, status, draft, prompt_tokens, completion_tokens)
     VALUES ($1, $2, $3, $4, 'draft', $5, $6, $7)`,
    [
      draftId,
      req.tenantSlug,
      req.userId,
      req.description,
      JSON.stringify(draft),
      rawResponse.usage.input_tokens,
      rawResponse.usage.output_tokens,
    ]
  );

  return draft;
}
