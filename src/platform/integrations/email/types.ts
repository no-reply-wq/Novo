/**
 * Email integration types — provider configs, templates, and send I/O.
 */

export type EmailProvider = 'smtp' | 'ses' | 'resend';

export interface EmailConfig {
  provider: EmailProvider;
  fromAddress: string;
  fromName: string;
  // SMTP
  smtpHost?: string;
  smtpPort?: number;
  smtpSecure?: boolean;
  smtpUser?: string;
  smtpPass?: string; // stored encrypted
  // SES
  sesRegion?: string;
  sesAccessKeyId?: string;
  sesSecretAccessKey?: string; // stored encrypted
  // Resend
  resendApiKey?: string; // stored encrypted
}

export interface EmailTemplate {
  id: string;
  appId: string;
  name: string;
  subject: string; // supports {{ expr }}
  bodyHtml: string; // supports {{ expr }} blocks
  bodyText?: string; // plain text fallback
}

export interface SendEmailInput {
  to: string | string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  bodyHtml: string;
  bodyText?: string;
  attachments?: Array<{
    filename: string;
    content: Buffer | string; // base64 or Buffer
    contentType: string;
  }>;
}

export interface SendEmailResult {
  messageId: string;
  provider: EmailProvider;
  sentAt: Date;
}
