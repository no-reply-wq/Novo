/**
 * Script AI Assistant — drafts tenant scripts using Claude.
 *
 * Calls the Anthropic Messages API directly via fetch (no SDK dependency).
 * Requires ANTHROPIC_API_KEY environment variable.
 */

export class NotConfiguredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotConfiguredError';
  }
}

// ─── SDK Reference ────────────────────────────────────────────────────────────

export const SCRIPT_SDK_REFERENCE = `
# Novo Script SDK

## db
- db.query(sql, params): Promise<Row[]>
- db.insert(table, data): Promise<Row>
- db.update(table, id, data): Promise<Row>
- db.delete(table, id): Promise<void>
All queries are scoped to the current tenant and respect row-level security.

## http
- http.fetch(url, options): Promise<Response>
URLs must be in the tenant's allowlist (configured in Integrations).
Private network addresses (localhost, 10.x, 172.16.x, 192.168.x) are blocked.

## secrets
- secrets.get(name): string
Returns an encrypted secret configured in Integrations.

## Helpers
- formatINR(amount: number): string  // "₹1,23,456.78"
- amountInWords(amount: number): string  // Indian number words
- now(): Date

## Example
export default async function run(input: { orderId: string }) {
  const [order] = await db.query('SELECT * FROM orders WHERE id = $1', [input.orderId])
  const gst = order.amount * 0.18
  return { gst, total: order.amount + gst, formatted: formatINR(order.amount + gst) }
}
` as const;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TableSchemaField {
  name: string;
  type: string;
  label?: string;
  required?: boolean;
}

export interface TableSchema {
  name: string;
  fields: TableSchemaField[];
}

export interface DraftScriptParams {
  description: string;
  tableSchema: TableSchema;
  sdkReference?: string;
}

export interface DraftScriptResult {
  code: string;
  explanation: string;
}

interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface AnthropicResponse {
  content: Array<{ type: string; text: string }>;
}

// ─── Implementation ───────────────────────────────────────────────────────────

function buildPrompt(params: DraftScriptParams): string {
  const sdk = params.sdkReference ?? SCRIPT_SDK_REFERENCE;

  const fields = params.tableSchema.fields
    .map(f => `  - ${f.name} (${f.type})${f.label ? ` — ${f.label}` : ''}${f.required ? ' [required]' : ''}`)
    .join('\n');

  return `You are writing a Novo platform script in TypeScript/JavaScript.

## SDK Reference
${sdk}

## Table Schema: ${params.tableSchema.name}
Fields:
${fields}

## Task
${params.description}

## Instructions
1. Write a complete, working script using the SDK above.
2. Export a default async function named "run".
3. Use proper TypeScript types where possible.
4. Add brief comments explaining the logic.
5. After the code, write a short explanation (2-3 sentences) of what the script does.

Format your response EXACTLY as:
\`\`\`typescript
// your code here
\`\`\`

EXPLANATION: Your 2-3 sentence explanation here.`;
}

function extractCodeAndExplanation(raw: string): DraftScriptResult {
  // Extract code block
  const codeMatch = raw.match(/```(?:typescript|javascript|ts|js)?\s*([\s\S]*?)```/);
  if (!codeMatch) {
    // If no code block, treat everything before EXPLANATION: as code
    const parts = raw.split(/EXPLANATION:/i);
    return {
      code: parts[0].trim(),
      explanation: parts[1]?.trim() ?? '',
    };
  }

  const code = codeMatch[1].trim();

  // Extract explanation
  const afterBlock = raw.slice(raw.indexOf('```', raw.indexOf(codeMatch[0]) + 3) + 3);
  const explanationMatch = afterBlock.match(/EXPLANATION:\s*([\s\S]+)/i);
  const explanation = explanationMatch
    ? explanationMatch[1].trim()
    : afterBlock.replace(/^[\s\n]+/, '').split('\n').slice(0, 3).join(' ').trim();

  return { code, explanation };
}

export async function draftScript(params: DraftScriptParams): Promise<DraftScriptResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new NotConfiguredError(
      'ANTHROPIC_API_KEY is not set. Configure it in environment variables to use the AI script assistant.',
    );
  }

  const prompt = buildPrompt(params);

  const messages: AnthropicMessage[] = [{ role: 'user', content: prompt }];

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-3-haiku-20240307',
      max_tokens: 2048,
      messages,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Anthropic API error ${response.status}: ${text}`);
  }

  const data = (await response.json()) as AnthropicResponse;
  const rawText = data.content
    .filter(c => c.type === 'text')
    .map(c => c.text)
    .join('');

  return extractCodeAndExplanation(rawText);
}
