/**
 * EmailSender — class-based facade over SMTP / SES / Resend transports.
 *
 * Config comes in pre-decrypted (caller is responsible for decryption).
 * Throws NotConfiguredError when required fields are absent.
 */

import nodemailer from 'nodemailer';
import { NotConfiguredError } from '../secrets/manager';
import { renderTemplateSafe } from '@/platform/expressions/template-parser';
import type { EmailConfig, EmailTemplate, SendEmailInput, SendEmailResult } from './types';

export class EmailSender {
  constructor(private readonly config: EmailConfig) {}

  async send(input: SendEmailInput): Promise<SendEmailResult> {
    switch (this.config.provider) {
      case 'smtp':
        return this.sendViaSMTP(input);
      case 'ses':
        return this.sendViaSES(input);
      case 'resend':
        return this.sendViaResend(input);
      default: {
        // Exhaustiveness check
        const _never: never = this.config.provider;
        throw new Error(`Unknown email provider: ${String(_never)}`);
      }
    }
  }

  async sendTemplate(
    template: EmailTemplate,
    data: Record<string, unknown>,
    overrides: Partial<SendEmailInput>,
  ): Promise<SendEmailResult> {
    const ctx = { variables: data };

    const { result: subject } = renderTemplateSafe(template.subject, ctx);
    const { result: bodyHtml } = renderTemplateSafe(template.bodyHtml, ctx);
    const bodyText = template.bodyText
      ? renderTemplateSafe(template.bodyText, ctx).result
      : undefined;

    return this.send({
      to: overrides.to ?? '',
      ...overrides,
      subject: overrides.subject ?? subject,
      bodyHtml: overrides.bodyHtml ?? bodyHtml,
      bodyText: overrides.bodyText ?? bodyText,
    });
  }

  // ── SMTP ────────────────────────────────────────────────────────────────────

  private async sendViaSMTP(input: SendEmailInput): Promise<SendEmailResult> {
    const { smtpHost, smtpPort, smtpSecure, smtpUser, smtpPass, fromAddress, fromName } =
      this.config;

    if (!smtpHost) {
      throw new NotConfiguredError('EmailConfig.smtpHost is required for SMTP provider');
    }

    const transport = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort ?? 587,
      secure: smtpSecure ?? false,
      auth: smtpUser && smtpPass ? { user: smtpUser, pass: smtpPass } : undefined,
    });

    const toAddresses = Array.isArray(input.to) ? input.to : [input.to];

    const info = await transport.sendMail({
      from: fromName ? `"${fromName}" <${fromAddress}>` : fromAddress,
      to: toAddresses,
      cc: input.cc,
      bcc: input.bcc,
      subject: input.subject,
      html: input.bodyHtml,
      text: input.bodyText,
      attachments: input.attachments?.map((a) => ({
        filename: a.filename,
        content:
          typeof a.content === 'string' ? Buffer.from(a.content, 'base64') : a.content,
        contentType: a.contentType,
      })),
    });

    return {
      messageId: info.messageId ?? `smtp-${Date.now()}`,
      provider: 'smtp',
      sentAt: new Date(),
    };
  }

  // ── SES ─────────────────────────────────────────────────────────────────────

  private async sendViaSES(input: SendEmailInput): Promise<SendEmailResult> {
    const { sesRegion, sesAccessKeyId, sesSecretAccessKey, fromAddress, fromName } =
      this.config;

    if (!sesRegion || !sesAccessKeyId || !sesSecretAccessKey) {
      throw new NotConfiguredError(
        'EmailConfig.sesRegion, sesAccessKeyId and sesSecretAccessKey are required for SES provider',
      );
    }

    // Use nodemailer with SES-compatible SMTP endpoint (port 587 TLS)
    // This avoids pulling in @aws-sdk/client-ses while remaining correct.
    const transport = nodemailer.createTransport({
      host: `email-smtp.${sesRegion}.amazonaws.com`,
      port: 587,
      secure: false,
      auth: { user: sesAccessKeyId, pass: sesSecretAccessKey },
    });

    const toAddresses = Array.isArray(input.to) ? input.to : [input.to];

    const info = await transport.sendMail({
      from: fromName ? `"${fromName}" <${fromAddress}>` : fromAddress,
      to: toAddresses,
      cc: input.cc,
      bcc: input.bcc,
      subject: input.subject,
      html: input.bodyHtml,
      text: input.bodyText,
      attachments: input.attachments?.map((a) => ({
        filename: a.filename,
        content:
          typeof a.content === 'string' ? Buffer.from(a.content, 'base64') : a.content,
        contentType: a.contentType,
      })),
    });

    return {
      messageId: info.messageId ?? `ses-${Date.now()}`,
      provider: 'ses',
      sentAt: new Date(),
    };
  }

  // ── Resend ──────────────────────────────────────────────────────────────────

  private async sendViaResend(input: SendEmailInput): Promise<SendEmailResult> {
    const { resendApiKey, fromAddress, fromName } = this.config;

    if (!resendApiKey) {
      throw new NotConfiguredError(
        'EmailConfig.resendApiKey is required for Resend provider',
      );
    }

    const toAddresses = Array.isArray(input.to) ? input.to : [input.to];
    const from = fromName ? `${fromName} <${fromAddress}>` : fromAddress;

    const body: Record<string, unknown> = {
      from,
      to: toAddresses,
      subject: input.subject,
      html: input.bodyHtml,
    };
    if (input.bodyText) body['text'] = input.bodyText;
    if (input.cc?.length) body['cc'] = input.cc;
    if (input.bcc?.length) body['bcc'] = input.bcc;
    if (input.attachments?.length) {
      body['attachments'] = input.attachments.map((a) => ({
        filename: a.filename,
        content:
          typeof a.content === 'string'
            ? a.content
            : a.content.toString('base64'),
        type: a.contentType,
      }));
    }

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`Resend API error: ${response.status} ${text}`);
    }

    const data = (await response.json()) as { id?: string };

    return {
      messageId: data.id ?? `resend-${Date.now()}`,
      provider: 'resend',
      sentAt: new Date(),
    };
  }
}
