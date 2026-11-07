/**
 * Tests for src/platform/ai/generator.ts
 */

import { generateAppDraft, generateScriptDraft } from '@/platform/ai/generator';

const mockFetch = jest.fn();
global.fetch = mockFetch;

function makeValidDraft() {
  return {
    appName: 'Purchase Order System', description: 'Manage POs and vendors',
    tables: [
      { name: 'Vendors', apiKey: 'vendors', description: 'Supplier master',
        fields: [{ name: 'Name', apiKey: 'name', type: 'text', required: true }, { name: 'Email', apiKey: 'email', type: 'email' }],
        relations: [] },
      { name: 'Purchase Orders', apiKey: 'purchase_orders', description: 'PO header',
        fields: [{ name: 'Name', apiKey: 'name', type: 'text', required: true }, { name: 'PO No', apiKey: 'po_no', type: 'autonumber' }],
        relations: [{ name: 'Vendor', targetTable: 'vendors', type: 'one_to_many' }] },
    ],
    pages: [
      { name: 'Dashboard', type: 'dashboard', primaryTable: 'purchase_orders' },
      { name: 'PO List', type: 'list', primaryTable: 'purchase_orders' },
    ],
    workflows: [{ name: 'PO Approval', trigger: 'status_changed:purchase_orders', description: 'Notify on status change' }],
    warnings: [],
  };
}

function makeOkResp(content: string) {
  return {
    ok: true,
    json: jest.fn().mockResolvedValue({ choices: [{ message: { role: 'assistant', content } }], usage: { prompt_tokens: 400, completion_tokens: 800, total_tokens: 1200 } }),
    text: jest.fn().mockResolvedValue(''),
  };
}

describe('generateAppDraft', () => {
  beforeEach(() => { mockFetch.mockReset(); });

  test('returns valid draft on correct JSON response', async () => {
    mockFetch.mockResolvedValueOnce(makeOkResp(JSON.stringify(makeValidDraft())));
    const result = await generateAppDraft({ description: 'A purchase order system' }, 'sk-key');
    expect(result.appName).toBe('Purchase Order System');
    expect(result.tables).toHaveLength(2);
    expect(result.pages).toHaveLength(2);
    expect(result.warnings).toHaveLength(0);
  });

  test('returns fallback draft on malformed JSON', async () => {
    mockFetch.mockResolvedValueOnce(makeOkResp('not json'));
    const result = await generateAppDraft({ description: 'Some app' }, 'sk-key');
    expect(result.appName).toBe('New App');
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  test('extracts JSON from markdown code block', async () => {
    const wrapped = '```json\n' + JSON.stringify(makeValidDraft()) + '\n```';
    mockFetch.mockResolvedValueOnce(makeOkResp(wrapped));
    const result = await generateAppDraft({ description: 'PO system' }, 'sk-key');
    expect(result.appName).toBe('Purchase Order System');
  });

  test('returns fallback when response structure is unexpected', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: jest.fn().mockResolvedValue({ unexpected: true }) });
    const result = await generateAppDraft({ description: 'Some app' }, 'sk-key');
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  test('throws when API returns non-ok status', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 429, text: jest.fn().mockResolvedValue('Rate limit') });
    await expect(generateAppDraft({ description: 'An app' }, 'sk-key')).rejects.toThrow(/429/);
  });

  test('passes industry and existingTables in the request body', async () => {
    mockFetch.mockResolvedValueOnce(makeOkResp(JSON.stringify(makeValidDraft())));
    await generateAppDraft({ description: 'Inventory system', industry: 'manufacturing', existingTables: ['customers'] }, 'sk-key');
    const calledBody = JSON.parse(mockFetch.mock.calls[0][1].body as string) as { messages: Array<{ role: string; content: string }> };
    const userMsg = calledBody.messages.find((m) => m.role === 'user');
    expect(userMsg?.content).toMatch(/manufacturing/i);
    expect(userMsg?.content).toMatch(/customers/i);
  });
});

describe('generateScriptDraft', () => {
  beforeEach(() => { mockFetch.mockReset(); });

  test('returns code and explanation on valid response', async () => {
    const sr = { code: '// REVIEW BEFORE RUNNING\nasync function main() { console.log("x"); }', explanation: 'Logs x.' };
    mockFetch.mockResolvedValueOnce(makeOkResp(JSON.stringify(sr)));
    const result = await generateScriptDraft('Log x', ['orders'], 'sk-key');
    expect(result.code).toMatch(/REVIEW BEFORE RUNNING/);
    expect(result.explanation.length).toBeGreaterThan(0);
  });

  test('prepends safety comment if AI omits it', async () => {
    mockFetch.mockResolvedValueOnce(makeOkResp(JSON.stringify({ code: 'async function main() {}', explanation: 'Nothing.' })));
    const result = await generateScriptDraft('Empty', [], 'sk-key');
    expect(result.code.startsWith('// REVIEW BEFORE RUNNING')).toBe(true);
  });

  test('throws on API error', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500, text: jest.fn().mockResolvedValue('ISE') });
    await expect(generateScriptDraft('script', [], 'sk-key')).rejects.toThrow(/500/);
  });
});
