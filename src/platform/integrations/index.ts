/**
 * Public API for src/platform/integrations.
 *
 * NOTE: getSecretValue is intentionally NOT exported here.
 * It is an internal implementation detail for ConnectorRunner only
 * and must never be accessible via the public API or tenant scripts.
 */

// ─── Secrets ──────────────────────────────────────────────────────────────────
export { encryptSecret, decryptSecret, getMasterKey, NotConfiguredError } from './secrets/manager';
export { storeSecret, rotateSecret } from './secrets/store';
// getSecretValue is NOT exported — internal use only

// ─── Email ────────────────────────────────────────────────────────────────────
export { sendEmail } from './email/sender';
export type { SendEmailParams, SendEmailResult, EmailAttachment } from './email/sender';
export { renderEmailTemplate } from './email/template';

// ─── WhatsApp ─────────────────────────────────────────────────────────────────
export { sendWhatsAppTemplate, sendWhatsAppText } from './whatsapp/client';
export type { SendWhatsAppTemplateParams, SendWhatsAppTextParams, WhatsAppSendResult } from './whatsapp/client';
export { verifyWhatsAppWebhook, parseWhatsAppInbound } from './whatsapp/webhook';
export type { WhatsAppMessage } from './whatsapp/webhook';

// ─── Storage ──────────────────────────────────────────────────────────────────
export { StorageClient } from './storage/client';
export type { StorageClientOptions } from './storage/client';
export { validateFileType } from './storage/validation';

// ─── PDF ──────────────────────────────────────────────────────────────────────
export { renderDocTemplate } from './pdf/renderer';
export type { RenderDocTemplateParams } from './pdf/renderer';

// ─── ConnectorRunner ──────────────────────────────────────────────────────────
export { runConnectorRequest, SsrfBlockedError, ConnectorNotFoundError, RequestNotFoundError } from './runner';
export type { RunConnectorRequestParams } from './runner';
