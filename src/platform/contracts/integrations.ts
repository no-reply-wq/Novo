/**
 * Connector and document-template contracts.
 *
 * RULE: Sub-agents may not change this file. Changes go through the Lead.
 */

// ─── ConnectorDef ─────────────────────────────────────────────────────────────

export type ConnectorKind =
  | 'http_rest'       // generic REST API
  | 'whatsapp_cloud'  // WhatsApp Cloud API (Meta)
  | 'email_smtp'      // outbound SMTP
  | 'email_imap'      // inbound IMAP / IDLE
  | 'google_sheets'
  | 'google_drive'
  | 'aws_s3'          // or any S3-compatible (R2, MinIO)
  | 'postgresql'      // direct DB access from scripts
  | 'openai'          // AI completion / embedding
  | 'custom';         // script-defined connector

/** Encrypted secret reference — actual value never leaves the server. */
export interface SecretRef {
  secretId: string;   // id in platform_secrets table
  hint?: string;      // last 4 chars shown in the UI
}

export interface ConnectorRequest {
  name: string;             // e.g. "get_customer"
  description?: string;
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'; // for http_rest
  path?: string;            // path template, e.g. "/customers/{{id}}"
  headers?: Record<string, string>;
  bodyTemplate?: string;    // JSON template with {{ bindings }}
  inputSchema?: Record<string, unknown>; // JSON Schema for inputs
  outputMapping?: Record<string, string>; // JSON path → field name
}

export interface ConnectorDef {
  id: string;
  appId: string;
  name: string;
  description?: string;
  kind: ConnectorKind;

  // Connection config (non-secret parts)
  baseUrl?: string;         // for http_rest
  defaultHeaders?: Record<string, string>;
  timeoutSeconds?: number;  // default 30

  // Secrets (referenced, never stored here)
  secrets: Record<string, SecretRef>; // e.g. { apiKey: { secretId: "..." } }

  // Defined callable requests (for http_rest and custom)
  requests?: ConnectorRequest[];

  // WhatsApp-specific
  whatsapp?: {
    phoneNumberId: string;
    businessAccountId: string;
    webhookVerifyToken?: string;
  };

  // Email-specific
  email?: {
    host: string;
    port: number;
    secure: boolean;        // TLS
    fromAddress: string;
    fromName?: string;
    imapHost?: string;
    imapPort?: number;
  };

  // S3 / R2 storage
  storage?: {
    bucket: string;
    region: string;
    endpoint?: string;      // for non-AWS (R2: account.r2.cloudflarestorage.com)
    publicBaseUrl?: string; // CDN URL for public files
  };

  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// ─── DocTemplateDef ───────────────────────────────────────────────────────────

export type DocTemplateFormat = 'pdf' | 'html' | 'docx';

export interface DocTemplateSection {
  id: string;
  kind: 'header' | 'footer' | 'body' | 'table' | 'signature_block' | 'qr_block' | 'barcode_block';
  rank: number;
  content: string;          // HTML / Handlebars template
  repeatFor?: string;       // relation id: render one section per related row
  hideWhen?: string;        // expression: hide this section when true
}

export interface DocTemplatePageSetup {
  size: 'A4' | 'Letter' | 'A5' | 'custom';
  widthMm?: number;         // for 'custom'
  heightMm?: number;
  orientation: 'portrait' | 'landscape';
  marginTopMm: number;
  marginBottomMm: number;
  marginLeftMm: number;
  marginRightMm: number;
}

export interface DocTemplateDef {
  id: string;
  appId: string;
  name: string;             // e.g. "Purchase Order PDF"
  description?: string;
  tableId: string;          // which table's records this template renders
  format: DocTemplateFormat;

  // Page setup (PDF / DOCX)
  pageSetup?: DocTemplatePageSetup;

  // Template sections
  sections: DocTemplateSection[];

  // Header / footer repeat on every page
  repeatHeader?: boolean;
  repeatFooter?: boolean;

  // Watermark
  watermarkText?: string;   // e.g. "DRAFT" — shown when record isn't approved
  watermarkConditionExpr?: string;

  // Auto-attach after render
  attachToRecord?: boolean;
  attachFieldId?: string;   // file field to store the generated PDF

  // Numbering
  pageNumbers?: boolean;
  pageNumberFormat?: string; // e.g. "Page {{page}} of {{total}}"

  version: number;
  createdAt: Date;
  updatedAt: Date;
  publishedAt?: Date;
}
