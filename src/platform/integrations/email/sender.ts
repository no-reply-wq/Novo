/**
 * Email sender — supports SMTP (nodemailer), Resend REST API, and AWS SES.
 *
 * Loads ConnectorDef from DB, decrypts credentials, sends the email,
 * and logs the result to public.email_log.
 */

import nodemailer from 'nodemailer';
import type { ConnectorDef } from '@/platform/contracts';
import { pgPool } from '@/lib/db/client';
import { getSecretValue } from '../secrets/store';

export interface EmailAttachment {
  filename: string;
  content: Buffer;
  mimeType: string;
}

export interface SendEmailParams {
  connectorId: string;
  to: string | string[];
  subject: string;
  htmlBody: string;
  textBody?: string;
  attachments?: EmailAttachment[];
  replyTo?: string;
}

export interface SendEmailResult {
  messageId: string;
}

/** Load a ConnectorDef from DB by id. */
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

async function logEmail(params: {
  appId: string | null;
  connectorId: string;
  to: string;
  subject: string;
  messageId: string | null;
  status: string;
  error?: string;
}): Promise<void> {
  await pgPool.query(
    `INSERT INTO public.email_log
       (app_id, connector_id, to_address, subject, message_id, status, error)
     VALUES ($1, $2::uuid, $3, $4, $5, $6, $7)`,
    [
      params.appId,
      params.connectorId,
      params.to,
      params.subject,
      params.messageId,
      params.status,
      params.error ?? null,
    ]
  );
}

export async function sendEmail(params: SendEmailParams): Promise<SendEmailResult> {
  const connector = await loadConnectorDef(params.connectorId);
  const toAddresses = Array.isArray(params.to) ? params.to : [params.to];
  const toStr = toAddresses.join(', ');

  let messageId: string;

  try {
    if (connector.kind === 'email_smtp') {
      messageId = await sendViaSMTP(connector, params);
    } else if (connector.kind === 'http_rest' && connector.baseUrl?.includes('resend.com')) {
      messageId = await sendViaResend(connector, params);
    } else {
      throw new Error(`Unsupported email connector kind: ${connector.kind}`);
    }

    await logEmail({
      appId: connector.appId,
      connectorId: connector.id,
      to: toStr,
      subject: params.subject,
      messageId,
      status: 'sent',
    });

    return { messageId };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    await logEmail({
      appId: connector.appId,
      connectorId: connector.id,
      to: toStr,
      subject: params.subject,
      messageId: null,
      status: 'failed',
      error: errorMsg,
    }).catch(() => { /* best-effort logging */ });
    throw err;
  }
}

async function sendViaSMTP(
  connector: ConnectorDef,
  params: SendEmailParams
): Promise<string> {
  if (!connector.email) {
    throw new Error('ConnectorDef missing email config for SMTP connector');
  }

  // Decrypt credentials
  const userRef = connector.secrets['smtpUser'];
  const passRef = connector.secrets['smtpPassword'];

  const smtpUser = userRef ? await getSecretValue(userRef) : undefined;
  const smtpPass = passRef ? await getSecretValue(passRef) : undefined;

  const transport = nodemailer.createTransport({
    host: connector.email.host,
    port: connector.email.port,
    secure: connector.email.secure,
    auth: smtpUser && smtpPass ? { user: smtpUser, pass: smtpPass } : undefined,
  });

  const toAddresses = Array.isArray(params.to) ? params.to : [params.to];

  const info = await transport.sendMail({
    from: connector.email.fromName
      ? `"${connector.email.fromName}" <${connector.email.fromAddress}>`
      : connector.email.fromAddress,
    to: toAddresses,
    subject: params.subject,
    html: params.htmlBody,
    text: params.textBody,
    replyTo: params.replyTo,
    attachments: params.attachments?.map((a) => ({
      filename: a.filename,
      content: a.content,
      contentType: a.mimeType,
    })),
  });

  return info.messageId ?? `smtp-${Date.now()}`;
}

async function sendViaResend(
  connector: ConnectorDef,
  params: SendEmailParams
): Promise<string> {
  const apiKeyRef = connector.secrets['resendApiKey'];
  if (!apiKeyRef) {
    throw new Error('ConnectorDef missing resendApiKey secret for Resend connector');
  }
  const apiKey = await getSecretValue(apiKeyRef);

  const toAddresses = Array.isArray(params.to) ? params.to : [params.to];

  const fromAddress = connector.email
    ? connector.email.fromName
      ? `${connector.email.fromName} <${connector.email.fromAddress}>`
      : connector.email.fromAddress
    : 'noreply@example.com';

  const body: Record<string, unknown> = {
    from: fromAddress,
    to: toAddresses,
    subject: params.subject,
    html: params.htmlBody,
  };
  if (params.textBody) body['text'] = params.textBody;
  if (params.replyTo) body['reply_to'] = params.replyTo;

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Resend API error: ${response.status} ${text}`);
  }

  const data = (await response.json()) as { id?: string };
  return data.id ?? `resend-${Date.now()}`;
}
