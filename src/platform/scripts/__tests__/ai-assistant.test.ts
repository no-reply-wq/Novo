import { draftScript, NotConfiguredError, SCRIPT_SDK_REFERENCE } from '../ai-assistant';
import type { TableSchema } from '../ai-assistant';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const orderSchema: TableSchema = {
  name: 'orders',
  fields: [
    { name: 'id', type: 'uuid', label: 'Order ID', required: true },
    { name: 'amount', type: 'number', label: 'Order Amount', required: true },
    { name: 'status', type: 'text', label: 'Status' },
    { name: 'customer_name', type: 'text', label: 'Customer Name' },
  ],
};

// ─── NotConfiguredError tests ─────────────────────────────────────────────────

describe('NotConfiguredError', () => {
  it('is thrown when ANTHROPIC_API_KEY is not set', async () => {
    const original = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    try {
      await expect(
        draftScript({ description: 'compute GST', tableSchema: orderSchema }),
      ).rejects.toThrow(NotConfiguredError);
    } finally {
      if (original !== undefined) process.env.ANTHROPIC_API_KEY = original;
    }
  });

  it('error message mentions ANTHROPIC_API_KEY', async () => {
    const original = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    try {
      await expect(
        draftScript({ description: 'compute GST', tableSchema: orderSchema }),
      ).rejects.toThrow('ANTHROPIC_API_KEY');
    } finally {
      if (original !== undefined) process.env.ANTHROPIC_API_KEY = original;
    }
  });
});

// ─── SCRIPT_SDK_REFERENCE ─────────────────────────────────────────────────────

describe('SCRIPT_SDK_REFERENCE', () => {
  it('mentions db.query', () => {
    expect(SCRIPT_SDK_REFERENCE).toContain('db.query');
  });

  it('mentions http.fetch', () => {
    expect(SCRIPT_SDK_REFERENCE).toContain('http.fetch');
  });

  it('mentions secrets.get', () => {
    expect(SCRIPT_SDK_REFERENCE).toContain('secrets.get');
  });

  it('mentions formatINR', () => {
    expect(SCRIPT_SDK_REFERENCE).toContain('formatINR');
  });

  it('mentions amountInWords', () => {
    expect(SCRIPT_SDK_REFERENCE).toContain('amountInWords');
  });

  it('includes SSRF warning', () => {
    expect(SCRIPT_SDK_REFERENCE).toContain('Private network addresses');
  });
});

// ─── Mocked API call tests ────────────────────────────────────────────────────

describe('draftScript with mocked API', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    delete process.env.ANTHROPIC_API_KEY;
  });

  function mockFetch(responseText: string) {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        content: [{ type: 'text', text: responseText }],
      }),
    } as unknown as Response);
  }

  it('calls the Anthropic Messages API with correct headers', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    mockFetch('```typescript\nexport default async function run() { return 42; }\n```\n\nEXPLANATION: Returns 42.');

    await draftScript({ description: 'return 42', tableSchema: orderSchema });

    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.anthropic.com/v1/messages',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'x-api-key': 'test-key',
          'anthropic-version': '2023-06-01',
        }),
      }),
    );
  });

  it('includes table schema in prompt', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    let capturedBody = '';
    global.fetch = jest.fn().mockImplementation(async (_url: string, init: RequestInit) => {
      capturedBody = init.body as string;
      return {
        ok: true,
        json: async () => ({ content: [{ type: 'text', text: '```typescript\nconst x = 1;\n```\nEXPLANATION: Does something.' }] }),
      } as unknown as Response;
    });

    await draftScript({ description: 'compute GST', tableSchema: orderSchema });

    const parsed = JSON.parse(capturedBody) as { messages: Array<{ content: string }> };
    const prompt = parsed.messages[0].content;
    expect(prompt).toContain('orders');
    expect(prompt).toContain('amount');
    expect(prompt).toContain('customer_name');
    expect(prompt).toContain('compute GST');
  });

  it('includes SDK reference in prompt', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    let capturedBody = '';
    global.fetch = jest.fn().mockImplementation(async (_url: string, init: RequestInit) => {
      capturedBody = init.body as string;
      return {
        ok: true,
        json: async () => ({ content: [{ type: 'text', text: '```typescript\nconst x = 1;\n```\nEXPLANATION: Does something.' }] }),
      } as unknown as Response;
    });

    await draftScript({ description: 'compute GST', tableSchema: orderSchema });

    const parsed = JSON.parse(capturedBody) as { messages: Array<{ content: string }> };
    const prompt = parsed.messages[0].content;
    expect(prompt).toContain('db.query');
    expect(prompt).toContain('formatINR');
  });

  it('extracts code and explanation from response', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    mockFetch(`
\`\`\`typescript
export default async function run(input: { orderId: string }) {
  const [order] = await db.query('SELECT * FROM orders WHERE id = $1', [input.orderId]);
  const gst = order.amount * 0.18;
  return { gst, total: order.amount + gst };
}
\`\`\`

EXPLANATION: This script calculates 18% GST on an order. It queries the order by ID and returns the GST amount and total.
`);

    const result = await draftScript({ description: 'GST at 18%', tableSchema: orderSchema });

    expect(result.code).toContain('export default async function run');
    expect(result.code).toContain('gst');
    expect(result.explanation).toContain('GST');
    expect(result.explanation.length).toBeGreaterThan(10);
  });

  it('handles API error response', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 429,
      text: async () => 'Rate limit exceeded',
    } as unknown as Response);

    await expect(
      draftScript({ description: 'compute GST', tableSchema: orderSchema }),
    ).rejects.toThrow('429');
  });

  it('uses custom sdkReference when provided', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    let capturedBody = '';
    global.fetch = jest.fn().mockImplementation(async (_url: string, init: RequestInit) => {
      capturedBody = init.body as string;
      return {
        ok: true,
        json: async () => ({ content: [{ type: 'text', text: '```typescript\nconst x = 1;\n```\nEXPLANATION: Custom SDK used.' }] }),
      } as unknown as Response;
    });

    await draftScript({
      description: 'custom task',
      tableSchema: orderSchema,
      sdkReference: '## Custom SDK\n- customMethod(): void',
    });

    const parsed = JSON.parse(capturedBody) as { messages: Array<{ content: string }> };
    expect(parsed.messages[0].content).toContain('Custom SDK');
    expect(parsed.messages[0].content).toContain('customMethod');
  });
});
