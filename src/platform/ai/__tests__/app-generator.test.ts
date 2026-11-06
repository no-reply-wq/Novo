/**
 * Tests for AI App Generator
 */

// Mock uuid before imports so modules that import uuid get the mock
jest.mock('uuid', () => ({ v4: () => 'test-uuid-1234' }));

import { generateApp } from '../app-generator';
import { applyDraft } from '../apply-draft';
import { NotConfiguredError } from '../../workflow/errors';
import type { GeneratedAppDraft } from '../types';
import type { PoolClient } from 'pg';

// ─── Mock pgPool ──────────────────────────────────────────────────────────────
jest.mock('@/lib/db/client', () => ({
  pgPool: {
    query: jest.fn().mockResolvedValue({ rows: [] }),
    connect: jest.fn(),
  },
  tenantQuery: jest.fn().mockResolvedValue({ rows: [] }),
}));

// ─── Mock fetch ───────────────────────────────────────────────────────────────
const mockFetch = jest.fn();
global.fetch = mockFetch;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeValidDraftJson(): object {
  return {
    app: {
      name: 'Inventory Manager',
      slug: 'inventory-manager',
      description: 'Manage inventory, suppliers, and orders',
      icon: '📦',
    },
    tables: [
      {
        name: 'Products',
        slug: 'products',
        description: 'Product catalogue',
        fields: [
          { name: 'Name', apiKey: 'name', type: 'text', required: true },
          { name: 'SKU', apiKey: 'sku', type: 'autonumber' },
          { name: 'Price', apiKey: 'price', type: 'currency', required: false },
          {
            name: 'Category',
            apiKey: 'category',
            type: 'dropdown',
            options: ['Electronics', 'Clothing'],
          },
        ],
        relations: [],
        hasStock: true,
      },
      {
        name: 'Suppliers',
        slug: 'suppliers',
        description: 'Supplier contacts',
        fields: [
          { name: 'Name', apiKey: 'name', type: 'text', required: true },
          { name: 'Email', apiKey: 'email', type: 'email' },
        ],
        relations: [],
      },
    ],
    pages: [
      {
        name: 'Dashboard',
        slug: 'dashboard',
        description: 'Overview KPIs',
        components: [
          { type: 'statcard', title: 'Total Products', dataSource: 'products' },
          { type: 'statcard', title: 'Total Suppliers', dataSource: 'suppliers' },
        ],
      },
      {
        name: 'Products',
        slug: 'products-list',
        description: 'Product list',
        components: [{ type: 'table', title: 'Products', dataSource: 'products' }],
      },
    ],
    workflows: [
      {
        name: 'Low Stock Alert',
        trigger: 'record_updated:products',
        description: 'Alert when stock is low',
        steps: ['Check stock level', 'Send WhatsApp alert to manager'],
      },
      {
        name: 'New Supplier Welcome',
        trigger: 'record_created:suppliers',
        description: 'Welcome new suppliers',
        steps: ['Send welcome email'],
      },
    ],
  };
}

function makeAnthropicResponse(content: string) {
  return {
    ok: true,
    json: jest.fn().mockResolvedValue({
      content: [{ type: 'text', text: content }],
      usage: { input_tokens: 500, output_tokens: 1200 },
    }),
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('generateApp', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    mockFetch.mockReset();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  test('throws NotConfiguredError when ANTHROPIC_API_KEY is missing', async () => {
    delete process.env.ANTHROPIC_API_KEY;

    await expect(
      generateApp({
        description: 'An inventory system',
        tenantSlug: 'test-tenant',
        userId: 'user-1',
      })
    ).rejects.toThrow(NotConfiguredError);
  });

  test('returns valid draft when AI returns correct JSON', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-test-key';

    const draftJson = makeValidDraftJson();
    mockFetch.mockResolvedValueOnce(makeAnthropicResponse(JSON.stringify(draftJson)));

    const draft = await generateApp({
      description: 'An inventory management system with suppliers',
      tenantSlug: 'acme',
      userId: 'user-42',
    });

    expect(draft.status).toBe('draft');
    expect(draft.tenantSlug).toBe('acme');
    expect(draft.app.name).toBe('Inventory Manager');
    expect(draft.tables).toHaveLength(2);
    expect(draft.tables[0].name).toBe('Products');
    expect(draft.pages).toHaveLength(2);
    expect(draft.workflows).toHaveLength(2);
    expect(draft.promptTokens).toBe(500);
    expect(draft.completionTokens).toBe(1200);
    expect(draft.id).toBeTruthy();
    expect(draft.generatedAt).toBeTruthy();
  });

  test('extracts JSON from markdown code block', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-test-key';

    const draftJson = makeValidDraftJson();
    const markdownWrapped = `Here is the app structure:\n\`\`\`json\n${JSON.stringify(draftJson)}\n\`\`\`\n`;
    mockFetch.mockResolvedValueOnce(makeAnthropicResponse(markdownWrapped));

    const draft = await generateApp({
      description: 'Inventory system',
      tenantSlug: 'acme',
      userId: 'user-1',
    });

    expect(draft.app.name).toBe('Inventory Manager');
    expect(draft.tables).toHaveLength(2);
  });

  test('throws with clear message when AI returns invalid JSON', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-test-key';

    mockFetch.mockResolvedValueOnce(makeAnthropicResponse('This is not JSON at all, sorry!'));

    await expect(
      generateApp({
        description: 'Inventory system',
        tenantSlug: 'acme',
        userId: 'user-1',
      })
    ).rejects.toThrow(/invalid JSON|missing required fields/i);
  });

  test('throws when AI response is missing required fields', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-test-key';

    mockFetch.mockResolvedValueOnce(
      makeAnthropicResponse(JSON.stringify({ app: { name: 'Foo' }, tables: [] }))
    );

    await expect(
      generateApp({
        description: 'Inventory system',
        tenantSlug: 'acme',
        userId: 'user-1',
      })
    ).rejects.toThrow(/missing required fields/i);
  });

  test('throws when AI returns no valid tables', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-test-key';

    const badDraft = {
      app: { name: 'X', slug: 'x', description: 'Y', icon: '🔥' },
      tables: [{ invalid: true }], // no valid tables
      pages: [],
      workflows: [],
    };
    mockFetch.mockResolvedValueOnce(makeAnthropicResponse(JSON.stringify(badDraft)));

    await expect(
      generateApp({
        description: 'Inventory system',
        tenantSlug: 'acme',
        userId: 'user-1',
      })
    ).rejects.toThrow(/no valid tables/i);
  });

  test('throws when Anthropic API returns error status', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-test-key';

    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 429,
      text: jest.fn().mockResolvedValue('Rate limit exceeded'),
    });

    await expect(
      generateApp({
        description: 'Inventory system',
        tenantSlug: 'acme',
        userId: 'user-1',
      })
    ).rejects.toThrow(/429/);
  });
});

describe('applyDraft', () => {
  const mockPgPool = jest.requireMock('@/lib/db/client').pgPool as {
    query: jest.MockedFunction<() => Promise<{ rows: unknown[] }>>;
  };

  const mockTenantQuery = jest.requireMock('@/lib/db/client').tenantQuery as jest.MockedFunction<
    () => Promise<{ rows: unknown[] }>
  >;

  const mockClient = {} as PoolClient;

  const sampleDraft: GeneratedAppDraft = {
    id: 'draft-123',
    tenantSlug: 'acme',
    status: 'draft',
    description: 'Inventory system',
    app: {
      name: 'Inventory Manager',
      slug: 'inventory-manager',
      description: 'Manage inventory',
      icon: '📦',
    },
    tables: [
      {
        name: 'Products',
        slug: 'products',
        description: 'Product catalogue',
        fields: [{ name: 'Name', apiKey: 'name', type: 'text', required: true }],
        relations: [],
        hasStock: true,
      },
    ],
    pages: [
      {
        name: 'Dashboard',
        slug: 'dashboard',
        description: 'KPI overview',
        components: [{ type: 'statcard', title: 'Total Products', dataSource: 'products' }],
      },
    ],
    workflows: [
      {
        name: 'Low Stock Alert',
        trigger: 'record_updated:products',
        description: 'Alert on low stock',
        steps: ['Check level', 'Send alert'],
      },
    ],
    generatedAt: new Date().toISOString(),
    promptTokens: 500,
    completionTokens: 1000,
  };

  beforeEach(() => {
    mockPgPool.query.mockReset();
    mockTenantQuery.mockReset();
    mockTenantQuery.mockResolvedValue({ rows: [] });
  });

  test('creates app record and returns correct counts', async () => {
    // First pgPool.query call returns the draft; subsequent calls are inserts
    mockPgPool.query
      .mockResolvedValueOnce({ rows: [{ id: 'draft-123', tenant_slug: 'acme', status: 'draft', draft: sampleDraft }] })
      .mockResolvedValue({ rows: [] });

    const result = await applyDraft('draft-123', 'acme', 'user-1', mockClient);

    expect(result.tablesCreated).toBe(1);
    expect(result.pagesCreated).toBe(1);
    expect(result.appId).toBeTruthy();

    // Verify app INSERT was called
    expect(mockPgPool.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO public.apps'),
      expect.any(Array)
    );

    // Verify status update was called
    expect(mockPgPool.query).toHaveBeenCalledWith(
      expect.stringContaining("SET status = 'published'"),
      expect.any(Array)
    );
  });

  test('throws when draft is not found', async () => {
    mockPgPool.query.mockResolvedValueOnce({ rows: [] });

    await expect(applyDraft('no-such-draft', 'acme', 'user-1', mockClient)).rejects.toThrow(
      /not found/i
    );
  });

  test('throws when draft is already published', async () => {
    mockPgPool.query.mockResolvedValueOnce({
      rows: [{ id: 'draft-123', tenant_slug: 'acme', status: 'published', draft: sampleDraft }],
    });

    await expect(applyDraft('draft-123', 'acme', 'user-1', mockClient)).rejects.toThrow(
      /already been applied/i
    );
  });

  test('calls tenantQuery to create meta tables and table records', async () => {
    mockPgPool.query
      .mockResolvedValueOnce({ rows: [{ id: 'draft-123', tenant_slug: 'acme', status: 'draft', draft: sampleDraft }] })
      .mockResolvedValue({ rows: [] });

    await applyDraft('draft-123', 'acme', 'user-1', mockClient);

    // Should have called tenantQuery multiple times (meta tables + table records + page records)
    expect(mockTenantQuery).toHaveBeenCalled();

    const calls = mockTenantQuery.mock.calls as unknown as Array<[string, string, ...unknown[]]>;
    const sqls = calls.map((c) => c[1]);
    expect(sqls.some((s) => s.includes('CREATE TABLE IF NOT EXISTS _tables'))).toBe(true);
    expect(sqls.some((s) => s.includes('INSERT INTO _tables'))).toBe(true);
    expect(sqls.some((s) => s.includes('INSERT INTO _pages'))).toBe(true);
  });
});
