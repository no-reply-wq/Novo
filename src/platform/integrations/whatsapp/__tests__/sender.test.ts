/**
 * Tests for WhatsApp sender (tenant-scoped).
 * Mocks fetch, DB, and secrets.
 */

import { jest } from '@jest/globals';

// ── Mock fetch ─────────────────────────────────────────────────────────────────
const mockFetch = jest.fn<typeof fetch>();
global.fetch = mockFetch;

// ── Mock DB ────────────────────────────────────────────────────────────────────
const mockQuery = jest.fn<(sql: unknown, params?: unknown[]) => Promise<{ rows: unknown[] }>>();
jest.mock('@/lib/db/client', () => ({
  pgPool: { query: mockQuery },
}));

// ── Mock secrets ───────────────────────────────────────────────────────────────
jest.mock('../../../integrations/secrets', () => ({
  decryptSecret: jest.fn<(enc: string, _tenant: string) => string>().mockImplementation(
    (enc: string) => `decrypted:${enc}`
  ),
}));

process.env['PLATFORM_SECRET'] = 'test-platform-secret-for-unit-tests';

import { sendWhatsAppTemplate } from '../sender';
import { NotConfiguredError } from '../../secrets/manager';

const makeJsonResponse = (data: unknown, ok = true): Response =>
  ({
    ok,
    status: ok ? 200 : 400,
    statusText: ok ? 'OK' : 'Bad Request',
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
  }) as unknown as Response;

const waConfig = {
  phoneNumberId: 'phone-123',
  accessToken: 'encrypted-token',
};

describe('sendWhatsAppTemplate (tenant-scoped)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQuery.mockResolvedValue({ rows: [{ config: waConfig }] });
  });

  it('calls Meta API with correct template payload', async () => {
    mockFetch.mockResolvedValueOnce(
      makeJsonResponse({ messages: [{ id: 'wamid.abc' }] })
    );

    await sendWhatsAppTemplate({
      tenantSlug: 'acme',
      to: '+919876543210',
      templateName: 'order_ready',
      templateParams: ['Order #42', '5 items'],
    });

    expect(mockFetch).toHaveBeenCalledWith(
      'https://graph.facebook.com/v18.0/phone-123/messages',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer decrypted:encrypted-token',
          'Content-Type': 'application/json',
        }),
      })
    );

    const body = JSON.parse(
      (mockFetch.mock.calls[0]?.[1] as RequestInit)?.body as string
    ) as Record<string, unknown>;
    expect(body['messaging_product']).toBe('whatsapp');
    expect(body['to']).toBe('+919876543210');
    expect((body['template'] as Record<string, unknown>)['name']).toBe('order_ready');
  });

  it('uses provided language code', async () => {
    mockFetch.mockResolvedValueOnce(makeJsonResponse({ messages: [{ id: 'wamid.1' }] }));

    await sendWhatsAppTemplate({
      tenantSlug: 'acme',
      to: '+1234567890',
      templateName: 'hello',
      templateParams: [],
      language: 'pt_BR',
    });

    const body = JSON.parse(
      (mockFetch.mock.calls[0]?.[1] as RequestInit)?.body as string
    ) as Record<string, unknown>;
    expect(
      ((body['template'] as Record<string, unknown>)['language'] as Record<string, unknown>)['code']
    ).toBe('pt_BR');
  });

  it('defaults language to en_US', async () => {
    mockFetch.mockResolvedValueOnce(makeJsonResponse({ messages: [{ id: 'wamid.2' }] }));

    await sendWhatsAppTemplate({
      tenantSlug: 'acme',
      to: '+1234567890',
      templateName: 'hello',
      templateParams: [],
    });

    const body = JSON.parse(
      (mockFetch.mock.calls[0]?.[1] as RequestInit)?.body as string
    ) as Record<string, unknown>;
    expect(
      ((body['template'] as Record<string, unknown>)['language'] as Record<string, unknown>)['code']
    ).toBe('en_US');
  });

  it('returns messageId from API', async () => {
    mockFetch.mockResolvedValueOnce(makeJsonResponse({ messages: [{ id: 'wamid.xyz' }] }));

    const result = await sendWhatsAppTemplate({
      tenantSlug: 'acme',
      to: '+1234567890',
      templateName: 'test',
      templateParams: [],
    });

    expect(result.messageId).toBe('wamid.xyz');
  });

  it('throws NotConfiguredError when no integration found', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    await expect(
      sendWhatsAppTemplate({
        tenantSlug: 'no-integration-tenant',
        to: '+1234567890',
        templateName: 'test',
        templateParams: [],
      })
    ).rejects.toThrow(NotConfiguredError);
  });

  it('throws on Meta API error', async () => {
    mockFetch.mockResolvedValueOnce(makeJsonResponse({ error: 'bad token' }, false));

    await expect(
      sendWhatsAppTemplate({
        tenantSlug: 'acme',
        to: '+1234567890',
        templateName: 'test',
        templateParams: [],
      })
    ).rejects.toThrow('WhatsApp API error: 400');
  });
});
