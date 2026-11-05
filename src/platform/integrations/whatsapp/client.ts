/**
 * Meta WhatsApp Cloud API client.
 *
 * Sends template messages and free-form text messages.
 * Loads ConnectorDef and decrypts secrets before each call.
 */

import type { ConnectorDef } from '@/platform/contracts';
import { pgPool } from '@/lib/db/client';
import { getSecretValue } from '../secrets/store';

export interface SendWhatsAppTemplateParams {
  connectorId: string;
  to: string;              // E.164 phone number, e.g. "+919876543210"
  templateName: string;
  languageCode: string;    // e.g. "en_US"
  components?: unknown[];  // Meta template component parameters
}

export interface SendWhatsAppTextParams {
  connectorId: string;
  to: string;
  message: string;
}

export interface WhatsAppSendResult {
  messageId: string;
}

const META_GRAPH_API = 'https://graph.facebook.com/v19.0';

async function loadConnectorDef(connectorId: string): Promise<ConnectorDef> {
  const result = await pgPool.query<{ data: ConnectorDef }>(
    `SELECT data FROM public.connector_defs WHERE id = $1`,
    [connectorId]
  );
  if (result.rows.length === 0) {
    throw new Error(`ConnectorDef not found: ${connectorId}`);
  }
  return result.rows[0].data;
}

async function logWhatsApp(params: {
  appId: string;
  connectorId: string;
  to: string;
  templateName: string | null;
  messageId: string | null;
  direction: 'outbound' | 'inbound';
  status: string;
  rawPayload: unknown;
}): Promise<void> {
  await pgPool.query(
    `INSERT INTO public.whatsapp_log
       (app_id, connector_id, to_number, template_name, message_id, direction, status, raw_payload)
     VALUES ($1, $2::uuid, $3, $4, $5, $6, $7, $8)`,
    [
      params.appId,
      params.connectorId,
      params.to,
      params.templateName,
      params.messageId,
      params.direction,
      params.status,
      JSON.stringify(params.rawPayload),
    ]
  );
}

async function getAccessToken(connector: ConnectorDef): Promise<string> {
  const tokenRef = connector.secrets['accessToken'];
  if (!tokenRef) {
    throw new Error('ConnectorDef missing accessToken secret for WhatsApp connector');
  }
  return getSecretValue(tokenRef);
}

export async function sendWhatsAppTemplate(
  params: SendWhatsAppTemplateParams
): Promise<WhatsAppSendResult> {
  const connector = await loadConnectorDef(params.connectorId);

  if (!connector.whatsapp?.phoneNumberId) {
    throw new Error('ConnectorDef missing whatsapp.phoneNumberId');
  }

  const accessToken = await getAccessToken(connector);

  const payload = {
    messaging_product: 'whatsapp',
    to: params.to,
    type: 'template',
    template: {
      name: params.templateName,
      language: { code: params.languageCode },
      components: params.components ?? [],
    },
  };

  const url = `${META_GRAPH_API}/${connector.whatsapp.phoneNumberId}/messages`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`WhatsApp API error: ${response.status} ${text}`);
  }

  const data = (await response.json()) as {
    messages?: Array<{ id: string }>;
  };
  const messageId = data.messages?.[0]?.id ?? `wa-${Date.now()}`;

  await logWhatsApp({
    appId: connector.appId,
    connectorId: connector.id,
    to: params.to,
    templateName: params.templateName,
    messageId,
    direction: 'outbound',
    status: 'sent',
    rawPayload: payload,
  }).catch(() => { /* best-effort */ });

  return { messageId };
}

export async function sendWhatsAppText(
  params: SendWhatsAppTextParams
): Promise<WhatsAppSendResult> {
  const connector = await loadConnectorDef(params.connectorId);

  if (!connector.whatsapp?.phoneNumberId) {
    throw new Error('ConnectorDef missing whatsapp.phoneNumberId');
  }

  const accessToken = await getAccessToken(connector);

  const payload = {
    messaging_product: 'whatsapp',
    to: params.to,
    type: 'text',
    text: { body: params.message },
  };

  const url = `${META_GRAPH_API}/${connector.whatsapp.phoneNumberId}/messages`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`WhatsApp API error: ${response.status} ${text}`);
  }

  const data = (await response.json()) as {
    messages?: Array<{ id: string }>;
  };
  const messageId = data.messages?.[0]?.id ?? `wa-${Date.now()}`;

  await logWhatsApp({
    appId: connector.appId,
    connectorId: connector.id,
    to: params.to,
    templateName: null,
    messageId,
    direction: 'outbound',
    status: 'sent',
    rawPayload: payload,
  }).catch(() => { /* best-effort */ });

  return { messageId };
}
