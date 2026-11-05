/**
 * Tests for PDF renderer.
 *
 * Uses Gotenberg mock (via fetch mock) as primary path.
 * Verifies output is a valid PDF buffer (starts with %PDF).
 */

import { jest } from '@jest/globals';

// ── Mock fetch for Gotenberg ───────────────────────────────────────────────────
const PDF_MAGIC = Buffer.from('%PDF-1.4 test-output');

const mockFetch = jest.fn<typeof fetch>().mockResolvedValue({
  ok: true,
  status: 200,
  statusText: 'OK',
  arrayBuffer: () => Promise.resolve(PDF_MAGIC.buffer.slice(
    PDF_MAGIC.byteOffset,
    PDF_MAGIC.byteOffset + PDF_MAGIC.byteLength
  )),
  text: () => Promise.resolve(''),
} as unknown as Response);

global.fetch = mockFetch;

import { renderDocTemplate } from '../renderer';
import type { DocTemplateDef } from '@/platform/contracts';

const simplTemplate: DocTemplateDef = {
  id: 'tpl-1',
  appId: 'app-1',
  name: 'Simple Invoice',
  tableId: 'tbl-invoices',
  format: 'pdf',
  sections: [
    {
      id: 'sec-header',
      kind: 'header',
      rank: 1,
      content: '<h1>Invoice #{{invoiceNumber}}</h1>',
    },
    {
      id: 'sec-body',
      kind: 'body',
      rank: 2,
      content: '<p>Customer: {{customerName}}</p><p>Amount: {{formatINR amount}}</p>',
    },
  ],
  pageSetup: {
    size: 'A4',
    orientation: 'portrait',
    marginTopMm: 15,
    marginBottomMm: 15,
    marginLeftMm: 15,
    marginRightMm: 15,
  },
  version: 1,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('renderDocTemplate', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env['GOTENBERG_URL'] = 'http://gotenberg:3000';
  });

  afterEach(() => {
    delete process.env['GOTENBERG_URL'];
  });

  it('returns a Buffer starting with %PDF (via Gotenberg mock)', async () => {
    const result = await renderDocTemplate({
      template: simplTemplate,
      record: { invoiceNumber: 'INV-001', customerName: 'Acme Corp', amount: 12345 },
    });

    expect(Buffer.isBuffer(result)).toBe(true);
    expect(result.subarray(0, 4).toString()).toBe('%PDF');
  });

  it('calls Gotenberg with POST to /forms/chromium/convert/html', async () => {
    await renderDocTemplate({
      template: simplTemplate,
      record: { invoiceNumber: 'INV-002', customerName: 'Test Co', amount: 999 },
    });

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/forms/chromium/convert/html'),
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('renders sections in rank order', async () => {
    const templateReversed: DocTemplateDef = {
      ...simplTemplate,
      sections: [
        { id: 'sec-b', kind: 'body', rank: 2, content: '<p>Body</p>' },
        { id: 'sec-h', kind: 'header', rank: 1, content: '<h1>Header</h1>' },
      ],
    };

    // Capture the HTML sent to Gotenberg
    let capturedHtml = '';
    mockFetch.mockImplementationOnce(async (_url, init) => {
      const body = init?.body as FormData;
      const file = body.get('files') as Blob;
      capturedHtml = await file.text();
      return {
        ok: true,
        arrayBuffer: () => Promise.resolve(PDF_MAGIC.buffer.slice(
          PDF_MAGIC.byteOffset,
          PDF_MAGIC.byteOffset + PDF_MAGIC.byteLength
        )),
      } as unknown as Response;
    });

    await renderDocTemplate({ template: templateReversed, record: {} });

    // Header (rank 1) should appear before body (rank 2)
    const hPos = capturedHtml.indexOf('<h1>Header</h1>');
    const bPos = capturedHtml.indexOf('<p>Body</p>');
    expect(hPos).toBeGreaterThanOrEqual(0);
    expect(bPos).toBeGreaterThanOrEqual(0);
    expect(hPos).toBeLessThan(bPos);
  });

  it('skips sections when hideWhen evaluates to true', async () => {
    const templateWithHide: DocTemplateDef = {
      ...simplTemplate,
      sections: [
        { id: 'sec-visible', kind: 'body', rank: 1, content: '<p>Visible</p>' },
        { id: 'sec-hidden', kind: 'body', rank: 2, content: '<p>SHOULD BE HIDDEN</p>', hideWhen: 'hide_me' },
      ],
    };

    const mockExprEngine = {
      evaluateSource: jest.fn((source: string) => source === 'hide_me' ? true : false),
      parse: jest.fn(),
      typeCheck: jest.fn(),
      evaluate: jest.fn(),
      toSql: jest.fn(),
    };

    let capturedHtml = '';
    mockFetch.mockImplementationOnce(async (_url, init) => {
      const body = init?.body as FormData;
      const file = body.get('files') as Blob;
      capturedHtml = await file.text();
      return {
        ok: true,
        arrayBuffer: () => Promise.resolve(PDF_MAGIC.buffer.slice(
          PDF_MAGIC.byteOffset,
          PDF_MAGIC.byteOffset + PDF_MAGIC.byteLength
        )),
      } as unknown as Response;
    });

    await renderDocTemplate({
      template: templateWithHide,
      record: {},
      exprEngine: mockExprEngine as unknown as import('@/platform/expr').ExprEngine,
    });

    expect(capturedHtml).toContain('Visible');
    expect(capturedHtml).not.toContain('SHOULD BE HIDDEN');
  });

  it('repeats sections for repeatFor relation rows', async () => {
    const templateWithRepeat: DocTemplateDef = {
      ...simplTemplate,
      sections: [
        {
          id: 'sec-line',
          kind: 'body',
          rank: 1,
          content: '<tr><td>{{item}}</td><td>{{qty}}</td></tr>',
          repeatFor: 'line_items',
        },
      ],
    };

    let capturedHtml = '';
    mockFetch.mockImplementationOnce(async (_url, init) => {
      const body = init?.body as FormData;
      const file = body.get('files') as Blob;
      capturedHtml = await file.text();
      return {
        ok: true,
        arrayBuffer: () => Promise.resolve(PDF_MAGIC.buffer.slice(
          PDF_MAGIC.byteOffset,
          PDF_MAGIC.byteOffset + PDF_MAGIC.byteLength
        )),
      } as unknown as Response;
    });

    await renderDocTemplate({
      template: templateWithRepeat,
      record: {},
      relations: {
        line_items: [
          { item: 'Widget A', qty: 5 },
          { item: 'Widget B', qty: 3 },
        ],
      },
    });

    expect(capturedHtml).toContain('Widget A');
    expect(capturedHtml).toContain('Widget B');
  });

  it('throws when Gotenberg returns an error', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      text: () => Promise.resolve('Gotenberg crashed'),
    } as unknown as Response);

    await expect(
      renderDocTemplate({ template: simplTemplate, record: {} })
    ).rejects.toThrow('Gotenberg error');
  });
});
