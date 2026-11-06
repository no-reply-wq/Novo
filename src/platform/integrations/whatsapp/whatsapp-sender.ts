/**
 * WhatsAppSender — class-based facade over Meta Cloud API.
 *
 * Config must be pre-decrypted by the caller.
 * Throws NotConfiguredError when required fields are absent.
 */

import { NotConfiguredError } from '../secrets/manager';

const META_GRAPH_API = 'https://graph.facebook.com/v18.0';

export interface WhatsAppConfig {
  phoneNumberId: string;
  accessToken: string; // encrypted in DB, decrypted before use
  verifyToken: string;
}

export interface WhatsAppTemplateParameter {
  type: 'text' | 'image' | 'document';
  text?: string;
  image?: { link: string };
  document?: { link: string };
}

export interface WhatsAppTemplateComponent {
  type: 'header' | 'body' | 'button';
  parameters: WhatsAppTemplateParameter[];
}

export interface SendWhatsAppInput {
  to: string; // phone with country code: +919876543210
  templateName: string;
  languageCode: string;
  components?: WhatsAppTemplateComponent[];
}

interface MetaMessagesResponse {
  messages?: Array<{ id: string }>;
}

export class WhatsAppSender {
  constructor(private readonly config: WhatsAppConfig) {
    if (!config.phoneNumberId) {
      throw new NotConfiguredError('WhatsAppConfig.phoneNumberId is required');
    }
    if (!config.accessToken) {
      throw new NotConfiguredError('WhatsAppConfig.accessToken is required');
    }
  }

  async send(input: SendWhatsAppInput): Promise<{ messageId: string }> {
    const payload: Record<string, unknown> = {
      messaging_product: 'whatsapp',
      to: input.to,
      type: 'template',
      template: {
        name: input.templateName,
        language: { code: input.languageCode },
        components: input.components ?? [],
      },
    };

    return this.postToMeta(payload);
  }

  async sendText(to: string, text: string): Promise<{ messageId: string }> {
    const payload: Record<string, unknown> = {
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body: text },
    };

    return this.postToMeta(payload);
  }

  private async postToMeta(
    payload: Record<string, unknown>,
  ): Promise<{ messageId: string }> {
    const url = `${META_GRAPH_API}/${this.config.phoneNumberId}/messages`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.config.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`WhatsApp API error: ${response.status} ${text}`);
    }

    const data = (await response.json()) as MetaMessagesResponse;
    const messageId = data.messages?.[0]?.id ?? `wa-${Date.now()}`;
    return { messageId };
  }
}
