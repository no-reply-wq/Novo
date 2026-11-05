/**
 * WhatsApp Cloud API webhook handler.
 *
 * verifyWhatsAppWebhook: validates X-Hub-Signature-256 header.
 * parseWhatsAppInbound: parses a Meta webhook body into a typed message.
 */

import crypto from 'crypto';

export interface WhatsAppMessage {
  from: string;
  messageId: string;
  timestamp: Date;
  type: 'text' | 'image' | 'document' | 'button_reply' | 'list_reply';
  text?: string;
  mediaId?: string;
  buttonPayload?: string;
}

/**
 * Verify a WhatsApp webhook signature.
 *
 * @param payload   The raw request body string (before JSON parsing)
 * @param signature The X-Hub-Signature-256 header value (e.g. "sha256=abc123...")
 * @param appSecret The app secret from Meta Developer Console
 * @returns true if the signature is valid, false otherwise
 */
export function verifyWhatsAppWebhook(
  payload: string,
  signature: string,
  appSecret: string
): boolean {
  if (!signature || !signature.startsWith('sha256=')) {
    return false;
  }

  const receivedHash = signature.slice('sha256='.length);
  const expectedHash = crypto
    .createHmac('sha256', appSecret)
    .update(payload, 'utf8')
    .digest('hex');

  // Constant-time comparison to prevent timing attacks
  try {
    return crypto.timingSafeEqual(
      Buffer.from(receivedHash, 'hex'),
      Buffer.from(expectedHash, 'hex')
    );
  } catch {
    return false;
  }
}

/**
 * Parse an inbound WhatsApp webhook body into a typed message.
 * Returns null if the body does not contain a recognisable message.
 */
export function parseWhatsAppInbound(body: unknown): WhatsAppMessage | null {
  if (!body || typeof body !== 'object') return null;

  const root = body as Record<string, unknown>;

  // Meta Cloud API webhook shape:
  // { object: "whatsapp_business_account", entry: [{ changes: [{ value: { messages: [...] } }] }] }
  const entry = Array.isArray(root['entry']) ? root['entry'] : [];
  if (entry.length === 0) return null;

  const changes = Array.isArray(entry[0]?.['changes']) ? entry[0]['changes'] : [];
  if (changes.length === 0) return null;

  const value = changes[0]?.['value'];
  if (!value || typeof value !== 'object') return null;

  const rawMessages = (value as Record<string, unknown>)['messages'];
  const messages: unknown[] = Array.isArray(rawMessages) ? rawMessages : [];

  if (messages.length === 0) return null;

  const msg = messages[0] as Record<string, unknown>;

  const from = typeof msg['from'] === 'string' ? msg['from'] : '';
  const messageId = typeof msg['id'] === 'string' ? msg['id'] : '';
  const tsSeconds = typeof msg['timestamp'] === 'string'
    ? parseInt(msg['timestamp'], 10)
    : 0;
  const timestamp = new Date(tsSeconds * 1000);
  const rawType = typeof msg['type'] === 'string' ? msg['type'] : '';

  if (!from || !messageId) return null;

  switch (rawType) {
    case 'text': {
      const textObj = msg['text'] as Record<string, unknown> | undefined;
      return {
        from,
        messageId,
        timestamp,
        type: 'text',
        text: typeof textObj?.['body'] === 'string' ? textObj['body'] : undefined,
      };
    }

    case 'image': {
      const imageObj = msg['image'] as Record<string, unknown> | undefined;
      return {
        from,
        messageId,
        timestamp,
        type: 'image',
        mediaId: typeof imageObj?.['id'] === 'string' ? imageObj['id'] : undefined,
      };
    }

    case 'document': {
      const docObj = msg['document'] as Record<string, unknown> | undefined;
      return {
        from,
        messageId,
        timestamp,
        type: 'document',
        mediaId: typeof docObj?.['id'] === 'string' ? docObj['id'] : undefined,
      };
    }

    case 'interactive': {
      const interactive = msg['interactive'] as Record<string, unknown> | undefined;
      const interactiveType = interactive?.['type'];

      if (interactiveType === 'button_reply') {
        const buttonReply = interactive?.['button_reply'] as Record<string, unknown> | undefined;
        return {
          from,
          messageId,
          timestamp,
          type: 'button_reply',
          buttonPayload: typeof buttonReply?.['id'] === 'string' ? buttonReply['id'] : undefined,
          text: typeof buttonReply?.['title'] === 'string' ? buttonReply['title'] : undefined,
        };
      }

      if (interactiveType === 'list_reply') {
        const listReply = interactive?.['list_reply'] as Record<string, unknown> | undefined;
        return {
          from,
          messageId,
          timestamp,
          type: 'list_reply',
          buttonPayload: typeof listReply?.['id'] === 'string' ? listReply['id'] : undefined,
          text: typeof listReply?.['title'] === 'string' ? listReply['title'] : undefined,
        };
      }

      return null;
    }

    default:
      return null;
  }
}
