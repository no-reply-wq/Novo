/**
 * Tests for WhatsApp client — mocks fetch and DB, asserts correct API call shape.
 */

import { jest } from '@jest/globals';

// ── Mock fetch ─────────────────────────────────────────────────────────────────
const mockFetch = jest.fn<typeof fetch>();
global.fetch = mockFetch;

// ── Mock DB ────────────────────────────────────────────────────────────────────
const mockQuery = jest.fn<(sql: unknown) => Promise<{ rows: unknown[] }>>();
jest.mock('@/lib/db/client', () => ({
  pgPool: { query: mockQuery },
}));

// ── Mock secrets store ─────────────────────────────────────────────────────────
jest.mock('../../secrets/store', () => ({
  getSecretValue: jest.fn<(ref: unknown) => Promise<string>>().mockResolvedValue('test-wa-token'),
}));

import { sendWhatsAppTemplate, sendWhatsAppText } from '../client';
import type { ConnectorDef } from '@/platform/contracts';

const waConnector: ConnectorDef = {
  id: 'conn-wa-1',
  appId: 'app-1',
  name: 'WhatsApp Test',
  kind: 'whatsapp_cloud',
  secrets: {
    accessToken: { secretId: 'secret-token' },
  },
  whatsapp: {
    phoneNumberId: '1234567890',
    businessAccountId: 'biz-123',
  },
  enabled: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockJsonResponse = (data: unknown, ok = true): Response => ({
  ok,
  status: ok ? 200 : 400,
  statusText: ok ? 'OK' : 'Bad Request',
  json: () => Promise.resolve(data),
  text: () => Promise.resolve(JSON.stringify(data)),
} as unknown as Response);

describe('sendWhatsAppTemplate', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQuery.mockImplementation(async (sql: unknown) => {
      if (String(sql).includes('connector_defs')) {
        return { rows: [{ data: waConnector }] };
      }
      return { rows: [] };
    });
  });

  it('calls Meta Graph API with correct template payload', async () => {
    mockFetch.mockResolvedValueOnce(
      mockJsonResponse({ messages: [{ id: 'wamid.abc123' }] })
    );

    await sendWhatsAppTemplate({
      connectorId: 'conn-wa-1',
      to: '+919876543210',
      templateName: 'order_confirmation',
      languageCode: 'en_US',
      components: [{ type: 'body', parameters: [{ type: 'text', text: 'Order #42' }] }],
    });

    expect(mockFetch).toHaveBeenCalledWith(
      'https://graph.facebook.com/v19.0/1234567890/messages',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer test-wa-token',
          'Content-Type': 'application/json',
        }),
      })
    );

    const callBody = JSON.parse(
      (mockFetch.mock.calls[0]?.[1] as RequestInit)?.body as string
    ) as Record<string, unknown>;
    expect(callBody['messaging_product']).toBe('whatsapp');
    expect(callBody['to']).toBe('+919876543210');
    expect(callBody['type']).toBe('template');
    expect((callBody['template'] as Record<string, unknown>)['name']).toBe('order_confirmation');
  });

  it('returns message id from API response', async () => {
    mockFetch.mockResolvedValueOnce(
      mockJsonResponse({ messages: [{ id: 'wamid.xyz456' }] })
    );

    const result = await sendWhatsAppTemplate({
      connectorId: 'conn-wa-1',
      to: '+919876543210',
      templateName: 'hello',
      languageCode: 'en_US',
    });

    expect(result.messageId).toBe('wamid.xyz456');
  });

  it('throws on API error', async () => {
    mockFetch.mockResolvedValueOnce(
      mockJsonResponse({ error: { message: 'Invalid token' } }, false)
    );

    await expect(
      sendWhatsAppTemplate({
        connectorId: 'conn-wa-1',
        to: '+919876543210',
        templateName: 'hello',
        languageCode: 'en_US',
      })
    ).rejects.toThrow('WhatsApp API error: 400');
  });
});

describe('sendWhatsAppText', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQuery.mockImplementation(async (sql: unknown) => {
      if (String(sql).includes('connector_defs')) {
        return { rows: [{ data: waConnector }] };
      }
      return { rows: [] };
    });
  });

  it('calls Meta Graph API with correct text payload', async () => {
    mockFetch.mockResolvedValueOnce(
      mockJsonResponse({ messages: [{ id: 'wamid.text1' }] })
    );

    await sendWhatsAppText({
      connectorId: 'conn-wa-1',
      to: '+919876543210',
      message: 'Hello, World!',
    });

    const callBody = JSON.parse(
      (mockFetch.mock.calls[0]?.[1] as RequestInit)?.body as string
    ) as Record<string, unknown>;
    expect(callBody['type']).toBe('text');
    expect((callBody['text'] as Record<string, unknown>)['body']).toBe('Hello, World!');
  });
});
