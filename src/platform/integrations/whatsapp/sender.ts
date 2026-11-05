/**
 * WhatsApp sender — tenant-slug-based interface.
 *
 * Loads the tenant's whatsapp_meta integration config from
 * platform.integration_configs, decrypts credentials, and calls
 * the Meta Cloud API.
 *
 * Throws NotConfiguredError if the tenant has no enabled whatsapp_meta config.
 */

import { pgPool } from '@/lib/db/client';
import { decryptSecret } from '../secrets';
import { NotConfiguredError } from '../secrets/manager';

const META_GRAPH_API = 'https://graph.facebook.com/v18.0';

export interface SendWhatsAppTemplateParams {
  tenantSlug: string;
  to: string;              // phone with country code, e.g. "+919876543210"
  templateName: string;
  templateParams: string[];
  language?: string;       // defaults to "en_US"
}

export interface WhatsAppSendResult {
  messageId: string;
}

interface WhatsAppConfig {
  phoneNumberId: string;
  accessToken: string;     // encrypted
}

async function loadWhatsAppConfig(tenantSlug: string): Promise<WhatsAppConfig> {
  const result = await pgPool.query<{ config: Record<string, string> }>(
    `SELECT config FROM platform.integration_configs
     WHERE tenant_slug = $1 AND type = 'whatsapp_meta' AND enabled = true
     ORDER BY created_at DESC
     LIMIT 1`,
    [tenantSlug]
  );

  if (result.rows.length === 0) {
    throw new NotConfiguredError(
      `No enabled whatsapp_meta integration found for tenant: ${tenantSlug}`
    );
  }

  const config = result.rows[0].config;

  if (!config['phoneNumberId'] || !config['accessToken']) {
    throw new NotConfiguredError(
      `whatsapp_meta integration for tenant ${tenantSlug} is missing phoneNumberId or accessToken`
    );
  }

  return {
    phoneNumberId: config['phoneNumberId'],
    accessToken: decryptSecret(config['accessToken'], tenantSlug),
  };
}

/**
 * Send a WhatsApp template message via Meta Cloud API.
 */
export async function sendWhatsAppTemplate(
  params: SendWhatsAppTemplateParams
): Promise<WhatsAppSendResult> {
  const { tenantSlug, to, templateName, templateParams, language = 'en_US' } = params;
  const cfg = await loadWhatsAppConfig(tenantSlug);

  const components =
    templateParams.length > 0
      ? [
          {
            type: 'body',
            parameters: templateParams.map((text) => ({ type: 'text', text })),
          },
        ]
      : [];

  const payload = {
    messaging_product: 'whatsapp',
    to,
    type: 'template',
    template: {
      name: templateName,
      language: { code: language },
      components,
    },
  };

  const url = `${META_GRAPH_API}/${cfg.phoneNumberId}/messages`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${cfg.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`WhatsApp API error: ${response.status} ${text}`);
  }

  const data = (await response.json()) as { messages?: Array<{ id: string }> };
  const messageId = data.messages?.[0]?.id ?? `wa-${Date.now()}`;

  return { messageId };
}
