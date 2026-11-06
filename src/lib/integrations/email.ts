/**
 * Email integration — sends via SMTP using nodemailer.
 *
 * Config comes from per-app integration settings stored in the DB.
 * Throws EmailNotConfiguredError when required fields are absent so callers
 * can distinguish "not set up" from an actual send failure.
 */

import nodemailer from 'nodemailer';

export interface EmailConfig {
  host?: string;
  port?: number;
  user?: string;
  pass?: string;
  from?: string;
  secure?: boolean | string; // true/'true' = TLS on connect (port 465), false = STARTTLS (port 587)
}

export interface EmailPayload {
  to: string;
  subject: string;
  body_html: string;
  body_text?: string;
}

export class EmailNotConfiguredError extends Error {
  constructor() {
    super('Email integration not configured — add SMTP settings in app settings');
    this.name = 'EmailNotConfiguredError';
  }
}

export async function sendEmail(config: EmailConfig, payload: EmailPayload): Promise<void> {
  if (!config.host || !config.user || !config.pass || !config.from) {
    throw new EmailNotConfiguredError();
  }

  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port ?? 587,
    secure: config.secure === true || config.secure === 'true',
    auth: {
      user: config.user,
      pass: config.pass,
    },
  });

  await transporter.sendMail({
    from: config.from,
    to: payload.to,
    subject: payload.subject,
    html: payload.body_html,
    text: payload.body_text,
  });
}
