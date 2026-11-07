import type { StepDef, WorkflowContext, StepResult, WorkflowDeps } from '../types';
export async function executeStep(step: StepDef, ctx: WorkflowContext, _deps: WorkflowDeps): Promise<StepResult> {
  const to = step.config['to'] as string | string[];
  const subject = step.config['subject'] as string;
  const body = step.config['body'] as string;
  if (!to) throw new Error('send_email: to is required');
  if (!subject) throw new Error('send_email: subject is required');
  if (!body) throw new Error('send_email: body is required');
  const recipients = Array.isArray(to) ? to : [to];
  const smtpHost = process.env.SMTP_HOST;
  if (!smtpHost) throw new Error('send_email: SMTP_HOST not configured');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const nodemailer = require('nodemailer') as typeof import('nodemailer');
  const transport = nodemailer.createTransport({ host: smtpHost, port: Number(process.env.SMTP_PORT ?? 587), secure: process.env.SMTP_SECURE === 'true', auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS ?? '' } : undefined });
  const info = await transport.sendMail({ from: (step.config['from'] as string) ?? 'noreply@novo.app', to: recipients, subject, html: body });
  void ctx;
  return { output: { messageId: info.messageId, recipients }, logs: [`Email sent to ${recipients.join(', ')}`] };
}
