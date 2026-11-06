/**
 * WhatsApp integration — delegates to Meta Cloud API.
 *
 * For template messages (required by Meta for business-initiated conversations),
 * use the WhatsAppSender class in src/platform/integrations/whatsapp/.
 * This module handles simple text messages for workflow actions.
 */

export interface WhatsAppConfig {
  phoneNumberId?: string;
  accessToken?: string;
}

export interface WhatsAppPayload {
  to: string;
  body: string;
}

export class WhatsAppNotConfiguredError extends Error {
  constructor() {
    super('WhatsApp integration not configured — add Phone Number ID and Access Token in app settings');
    this.name = 'WhatsAppNotConfiguredError';
  }
}

export async function sendWhatsApp(config: WhatsAppConfig, payload: WhatsAppPayload): Promise<void> {
  if (!config.phoneNumberId || !config.accessToken) {
    throw new WhatsAppNotConfiguredError();
  }

  const url = `https://graph.facebook.com/v19.0/${encodeURIComponent(config.phoneNumberId)}/messages`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: payload.to,
      type: 'text',
      text: { body: payload.body },
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`WhatsApp send failed (${res.status}): ${JSON.stringify(err)}`);
  }
}
