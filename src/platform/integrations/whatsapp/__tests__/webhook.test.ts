/**
 * Tests for WhatsApp webhook verification and parsing.
 * Attack test: tampered signatures must be rejected.
 */

import crypto from 'crypto';
import { verifyWhatsAppWebhook, parseWhatsAppInbound } from '../webhook';

const APP_SECRET = 'my-super-secret-app-secret';

function makeSignature(payload: string, secret: string): string {
  const hash = crypto.createHmac('sha256', secret).update(payload, 'utf8').digest('hex');
  return `sha256=${hash}`;
}

describe('verifyWhatsAppWebhook', () => {
  const payload = JSON.stringify({ entry: [{ id: '1' }] });

  it('accepts a valid signature', () => {
    const sig = makeSignature(payload, APP_SECRET);
    expect(verifyWhatsAppWebhook(payload, sig, APP_SECRET)).toBe(true);
  });

  // ── Attack tests ──────────────────────────────────────────────────────────

  it('rejects a tampered payload (SSRF / injection attack)', () => {
    const tamperedPayload = JSON.stringify({ entry: [{ id: 'TAMPERED' }] });
    const sig = makeSignature(payload, APP_SECRET);  // signature for original payload
    expect(verifyWhatsAppWebhook(tamperedPayload, sig, APP_SECRET)).toBe(false);
  });

  it('rejects a signature computed with a wrong secret', () => {
    const wrongSig = makeSignature(payload, 'wrong-secret');
    expect(verifyWhatsAppWebhook(payload, wrongSig, APP_SECRET)).toBe(false);
  });

  it('rejects a missing signature', () => {
    expect(verifyWhatsAppWebhook(payload, '', APP_SECRET)).toBe(false);
  });

  it('rejects a signature without sha256= prefix', () => {
    const hash = crypto.createHmac('sha256', APP_SECRET).update(payload).digest('hex');
    expect(verifyWhatsAppWebhook(payload, hash, APP_SECRET)).toBe(false);
  });

  it('rejects a truncated / malformed hex signature', () => {
    expect(verifyWhatsAppWebhook(payload, 'sha256=deadbeef', APP_SECRET)).toBe(false);
  });

  it('uses constant-time comparison (does not throw on length mismatch)', () => {
    // If the implementation does a naive string compare it would throw on
    // Buffer.from('deadbeef','hex') (4 bytes) vs expected (32 bytes).
    // timingSafeEqual would throw — our code should catch that and return false.
    expect(() =>
      verifyWhatsAppWebhook(payload, 'sha256=deadbeef', APP_SECRET)
    ).not.toThrow();
    expect(verifyWhatsAppWebhook(payload, 'sha256=deadbeef', APP_SECRET)).toBe(false);
  });
});

describe('parseWhatsAppInbound', () => {
  const makeBody = (overrides: Record<string, unknown> = {}) => ({
    object: 'whatsapp_business_account',
    entry: [
      {
        changes: [
          {
            value: {
              messaging_product: 'whatsapp',
              messages: [
                {
                  from: '+919876543210',
                  id: 'wamid.abc123',
                  timestamp: '1700000000',
                  type: 'text',
                  text: { body: 'Hello!' },
                  ...overrides,
                },
              ],
            },
          },
        ],
      },
    ],
  });

  it('parses a text message', () => {
    const result = parseWhatsAppInbound(makeBody());
    expect(result).toEqual(
      expect.objectContaining({
        from: '+919876543210',
        messageId: 'wamid.abc123',
        type: 'text',
        text: 'Hello!',
      })
    );
    expect(result?.timestamp).toBeInstanceOf(Date);
  });

  it('parses an image message', () => {
    const result = parseWhatsAppInbound(
      makeBody({ type: 'image', image: { id: 'media-123', mime_type: 'image/jpeg' } })
    );
    expect(result?.type).toBe('image');
    expect(result?.mediaId).toBe('media-123');
  });

  it('parses a button_reply interactive message', () => {
    const result = parseWhatsAppInbound(
      makeBody({
        type: 'interactive',
        interactive: {
          type: 'button_reply',
          button_reply: { id: 'btn-yes', title: 'Yes' },
        },
      })
    );
    expect(result?.type).toBe('button_reply');
    expect(result?.buttonPayload).toBe('btn-yes');
    expect(result?.text).toBe('Yes');
  });

  it('returns null for empty body', () => {
    expect(parseWhatsAppInbound(null)).toBeNull();
    expect(parseWhatsAppInbound({})).toBeNull();
    expect(parseWhatsAppInbound({ entry: [] })).toBeNull();
  });

  it('returns null for unrecognised message type', () => {
    const result = parseWhatsAppInbound(makeBody({ type: 'sticker' }));
    expect(result).toBeNull();
  });
});
