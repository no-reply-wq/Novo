/**
 * AI App Draft Generator
 */

import { buildSystemPrompt, buildUserPrompt } from './prompt-builder';
import type { AiGeneratorRequest, AiGeneratorDraft, AiTableDraft, AiPageDraft, AiWorkflowDraft } from './ai-types';

const DEFAULT_MODEL = 'gpt-4o-mini';
const OPENAI_CHAT_URL = 'https://api.openai.com/v1/chat/completions';

interface OpenAiChoice { message: { role: string; content: string | null }; }
interface OpenAiUsage { prompt_tokens: number; completion_tokens: number; total_tokens: number; }
interface OpenAiResponse { choices: OpenAiChoice[]; usage: OpenAiUsage; }

function isOpenAiResponse(val: unknown): val is OpenAiResponse {
  if (typeof val !== 'object' || val === null) return false;
  const obj = val as Record<string, unknown>;
  if (!Array.isArray(obj.choices) || obj.choices.length === 0) return false;
  const choice = obj.choices[0] as Record<string, unknown>;
  if (typeof choice.message !== 'object' || choice.message === null) return false;
  const msg = choice.message as Record<string, unknown>;
  return typeof msg.content === 'string' || msg.content === null;
}

function isAiTableDraft(val: unknown): val is AiTableDraft {
  if (typeof val !== 'object' || val === null) return false;
  const obj = val as Record<string, unknown>;
  return typeof obj.name === 'string' && typeof obj.apiKey === 'string' &&
    typeof obj.description === 'string' && Array.isArray(obj.fields) && Array.isArray(obj.relations);
}

function isAiPageDraft(val: unknown): val is AiPageDraft {
  if (typeof val !== 'object' || val === null) return false;
  const obj = val as Record<string, unknown>;
  return typeof obj.name === 'string' && typeof obj.type === 'string' && typeof obj.primaryTable === 'string';
}

function isAiWorkflowDraft(val: unknown): val is AiWorkflowDraft {
  if (typeof val !== 'object' || val === null) return false;
  const obj = val as Record<string, unknown>;
  return typeof obj.name === 'string' && typeof obj.trigger === 'string' && typeof obj.description === 'string';
}

interface ParsedDraft {
  appName: string; description: string;
  tables: unknown[]; pages: unknown[]; workflows: unknown[]; warnings: unknown[];
}

function isParsedDraft(val: unknown): val is ParsedDraft {
  if (typeof val !== 'object' || val === null) return false;
  const obj = val as Record<string, unknown>;
  return typeof obj.appName === 'string' && typeof obj.description === 'string' &&
    Array.isArray(obj.tables) && Array.isArray(obj.pages) && Array.isArray(obj.workflows);
}

function extractJson(text: string): string {
  const cb = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
  if (cb) return cb[1].trim();
  const jo = /(\{[\s\S]*\})/.exec(text);
  if (jo) return jo[1].trim();
  return text.trim();
}

function makeFallbackDraft(description: string): AiGeneratorDraft {
  return { appName: 'New App', description, tables: [], pages: [], workflows: [],
    warnings: ['AI returned an unreadable response. Please try again or build manually.'] };
}

export interface TokenUsage { promptTokens: number; completionTokens: number; totalTokens: number; }
let _lastTokenUsage: TokenUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
export function getLastTokenUsage(): TokenUsage { return { ..._lastTokenUsage }; }

export async function generateAppDraft(
  req: AiGeneratorRequest, apiKey: string, model: string = DEFAULT_MODEL,
): Promise<AiGeneratorDraft> {
  const response = await fetch(OPENAI_CHAT_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model, response_format: { type: 'json_object' }, temperature: 0.3,
      messages: [
        { role: 'system', content: buildSystemPrompt() },
        { role: 'user', content: buildUserPrompt(req) },
      ],
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => 'unknown error');
    throw new Error(`OpenAI API error ${response.status}: ${errorBody}`);
  }

  const raw: unknown = await response.json();
  if (!isOpenAiResponse(raw)) return makeFallbackDraft(req.description);

  _lastTokenUsage = {
    promptTokens: raw.usage.prompt_tokens,
    completionTokens: raw.usage.completion_tokens,
    totalTokens: raw.usage.total_tokens,
  };

  const content = raw.choices[0].message.content ?? '';
  let parsed: unknown;
  try { parsed = JSON.parse(extractJson(content)); } catch { return makeFallbackDraft(req.description); }

  if (!isParsedDraft(parsed)) return makeFallbackDraft(req.description);

  return {
    appName: parsed.appName, description: parsed.description,
    tables: parsed.tables.filter(isAiTableDraft),
    pages: parsed.pages.filter(isAiPageDraft),
    workflows: parsed.workflows.filter(isAiWorkflowDraft),
    warnings: parsed.warnings.filter((w): w is string => typeof w === 'string'),
  };
}

const SCRIPT_SYSTEM_PROMPT = `You are a Novo platform automation script expert.
Return a JSON object: { "code": "string", "explanation": "string" }
Rules:
- Begin the code with: // REVIEW BEFORE RUNNING
- Use async/await throughout
- The explanation field (plain text, 2-3 sentences) should describe what the script does`;

export async function generateScriptDraft(
  description: string, tableContext: string[], apiKey: string, model: string = DEFAULT_MODEL,
): Promise<{ code: string; explanation: string }> {
  const userContent = [`Write a Novo automation script for: ${description}`,
    tableContext.length > 0 ? `Available tables: ${tableContext.join(', ')}` : ''].filter(Boolean).join('\n');

  const response = await fetch(OPENAI_CHAT_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model, response_format: { type: 'json_object' }, temperature: 0.2,
      messages: [{ role: 'system', content: SCRIPT_SYSTEM_PROMPT }, { role: 'user', content: userContent }],
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => 'unknown error');
    throw new Error(`OpenAI API error ${response.status}: ${errorBody}`);
  }

  const raw: unknown = await response.json();
  if (!isOpenAiResponse(raw)) throw new Error('Unexpected response from OpenAI');

  const content = raw.choices[0].message.content ?? '{}';
  let parsed: unknown;
  try { parsed = JSON.parse(extractJson(content)); } catch { throw new Error('AI returned invalid JSON for script draft'); }

  if (typeof parsed !== 'object' || parsed === null ||
      typeof (parsed as Record<string, unknown>).code !== 'string' ||
      typeof (parsed as Record<string, unknown>).explanation !== 'string') {
    throw new Error('AI script response missing code or explanation fields');
  }

  const result = parsed as { code: string; explanation: string };
  if (!result.code.startsWith('// REVIEW BEFORE RUNNING')) {
    result.code = `// REVIEW BEFORE RUNNING\n${result.code}`;
  }
  return result;
}
