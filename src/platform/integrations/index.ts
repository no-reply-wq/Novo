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

// ─── Integration types (tenant-scoped layer) ──────────────────────────────────
export type { IntegrationConfig, IntegrationType } from './types';

// ─── Tenant-scoped secrets ────────────────────────────────────────────────────
// Note: encryptSecret / decryptSecret below are the tenant-scoped variants
// that use HKDF derivation per tenant. The existing getMasterKey-based variants
// remain exported from secrets/manager above.
export {
  encryptSecret as encryptTenantSecret,
  decryptSecret as decryptTenantSecret,
} from './secrets';

// ─── Email templates ──────────────────────────────────────────────────────────
export { renderEmailTemplate as renderEmailTemplateTokens } from './email/templates';

// ─── WhatsApp sender (tenant-scoped) ──────────────────────────────────────────
export { sendWhatsAppTemplate as sendWhatsAppTenantTemplate } from './whatsapp/sender';
export type { SendWhatsAppTemplateParams as TenantSendWhatsAppParams } from './whatsapp/sender';

// ─── Storage (tenant-scoped) ──────────────────────────────────────────────────
export {
  uploadFile as uploadTenantFile,
  getSignedDownloadUrl,
  deleteFile as deleteTenantFile,
} from './storage/storage';
export type { UploadFileParams, UploadFileResult } from './storage/storage';

// ─── REST connector (tenant-scoped) ───────────────────────────────────────────
export { executeRestRequest } from './rest/connector';
export type { ExecuteRestRequestParams } from './rest/connector';
