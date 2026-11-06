/**
 * Tests for WhatsAppSender — class-based facade over Meta Cloud API.
 * Mocks fetch; asserts correct API URL, headers, and payload.
 */

import { jest } from '@jest/globals';

// ── Mock fetch ─────────────────────────────────────────────────────────────────
const mockFetch = jest.fn<typeof fetch>();
global.fetch = mockFetch;

import { WhatsAppSender } from '../whatsapp-sender';
import { NotConfiguredError } from '../../secrets/manager';
import type { WhatsAppConfig } from '../whatsapp-sender';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const config: WhatsAppConfig = {
  phoneNumberId: 'phone-number-123',
  accessToken: 'my-access-token',
  verifyToken: 'my-verify-token',
};

const makeJsonResponse = (data: unknown, ok = true): Response =>
  ({
    ok,
    status: ok ? 200 : 400,
    statusText: ok ? 'OK' : 'Bad Request',
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
  }) as unknown as Response;

// ─── send() tests ─────────────────────────────────────────────────────────────

describe('WhatsAppSender.send()', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('calls correct Meta API URL', async () => {
    mockFetch.mockResolvedValueOnce(makeJsonResponse({ messages: [{ id: 'wamid.abc' }] }));

    const sender = new WhatsAppSender(config);
    await sender.send({
      to: '+919876543210',
      templateName: 'order_ready',
      languageCode: 'en_US',
    });

    expect(mockFetch).toHaveBeenCalledWith(
      'https://graph.facebook.com/v18.0/phone-number-123/messages',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('sends Bearer authorization header', async () => {
    mockFetch.mockResolvedValueOnce(makeJsonResponse({ messages: [{ id: 'wamid.1' }] }));

    const sender = new WhatsAppSender(config);
    await sender.send({ to: '+1234567890', templateName: 'hello', languageCode: 'en_US' });

    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer my-access-token',
        }),
      }),
    );
  });

  it('sends correct template payload with components', async () => {
    mockFetch.mockResolvedValueOnce(makeJsonResponse({ messages: [{ id: 'wamid.2' }] }));

    const sender = new WhatsAppSender(config);
    await sender.send({
      to: '+919876543210',
      templateName: 'order_ready',
      languageCode: 'en_US',
      components: [
        { type: 'body', parameters: [{ type: 'text', text: 'Order #42' }] },
      ],
    });

    const body = JSON.parse(
      (mockFetch.mock.calls[0]?.[1] as RequestInit)?.body as string,
    ) as Record<string, unknown>;

    expect(body['messaging_product']).toBe('whatsapp');
    expect(body['to']).toBe('+919876543210');
    expect((body['template'] as Record<string, unknown>)['name']).toBe('order_ready');
    expect(
      ((body['template'] as Record<string, unknown>)['language'] as Record<string, unknown>)[
        'code'
      ],
    ).toBe('en_US');
    expect(
      (body['template'] as Record<string, unknown>)['components'],
    ).toEqual([{ type: 'body', parameters: [{ type: 'text', text: 'Order #42' }] }]);
  });

  it('returns messageId from Meta response', async () => {
    mockFetch.mockResolvedValueOnce(makeJsonResponse({ messages: [{ id: 'wamid.xyz' }] }));

    const sender = new WhatsAppSender(config);
    const result = await sender.send({
      to: '+1234567890',
      templateName: 'test',
      languageCode: 'en_US',
    });

    expect(result.messageId).toBe('wamid.xyz');
  });

  it('throws on Meta API error', async () => {
    mockFetch.mockResolvedValueOnce(makeJsonResponse({ error: 'invalid token' }, false));

    const sender = new WhatsAppSender(config);
    await expect(
      sender.send({ to: '+1234567890', templateName: 'test', languageCode: 'en_US' }),
    ).rejects.toThrow('WhatsApp API error: 400');
  });
});

// ─── sendText() tests ─────────────────────────────────────────────────────────

describe('WhatsAppSender.sendText()', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('sends a text message payload', async () => {
    mockFetch.mockResolvedValueOnce(makeJsonResponse({ messages: [{ id: 'wamid.text1' }] }));

    const sender = new WhatsAppSender(config);
    await sender.sendText('+919876543210', 'Your order is ready!');

    const body = JSON.parse(
      (mockFetch.mock.calls[0]?.[1] as RequestInit)?.body as string,
    ) as Record<string, unknown>;

    expect(body['type']).toBe('text');
    expect((body['text'] as Record<string, unknown>)['body']).toBe('Your order is ready!');
  });

  it('returns messageId for text messages', async () => {
    mockFetch.mockResolvedValueOnce(makeJsonResponse({ messages: [{ id: 'wamid.text2' }] }));

    const sender = new WhatsAppSender(config);
    const result = await sender.sendText('+1234567890', 'Hello');
    expect(result.messageId).toBe('wamid.text2');
  });
});

// ─── NotConfiguredError tests ─────────────────────────────────────────────────

describe('WhatsAppSender — NotConfiguredError', () => {
  it('throws when phoneNumberId is missing', () => {
    expect(() => new WhatsAppSender({ ...config, phoneNumberId: '' })).toThrow(
      NotConfiguredError,
    );
  });

  it('throws when accessToken is missing', () => {
    expect(() => new WhatsAppSender({ ...config, accessToken: '' })).toThrow(
      NotConfiguredError,
    );
  });
});

// ─── Webhook GET verification test ───────────────────────────────────────────

describe('WhatsApp webhook GET verification', () => {
  it('verifyWhatsAppWebhook returns true for a valid signature', async () => {
    const { verifyWhatsAppWebhook } = await import('../webhook');
    const crypto = await import('crypto');

    const payload = JSON.stringify({ entry: [{ id: '1' }] });
    const secret = 'my-verify-secret';
    const hash = crypto.createHmac('sha256', secret).update(payload, 'utf8').digest('hex');
    const sig = `sha256=${hash}`;

    expect(verifyWhatsAppWebhook(payload, sig, secret)).toBe(true);
  });

  it('verifyWhatsAppWebhook rejects an invalid signature', async () => {
    const { verifyWhatsAppWebhook } = await import('../webhook');

    expect(verifyWhatsAppWebhook('tampered', 'sha256=deadbeef', 'secret')).toBe(false);
  });
});
