/**
 * Tests for EmailSender — the new class-based facade.
 * Mocks nodemailer and fetch; asserts on correct transport and envelope fields.
 */

import { jest } from '@jest/globals';

// ── Mock nodemailer ────────────────────────────────────────────────────────────
const mockSendMail = jest
  .fn<() => Promise<{ messageId: string }>>()
  .mockResolvedValue({ messageId: 'smtp-test-id' });

const mockCreateTransport = jest.fn(() => ({ sendMail: mockSendMail }));

jest.mock('nodemailer', () => ({
  __esModule: true,
  default: { createTransport: mockCreateTransport },
}));

// ── Mock fetch (Resend) ────────────────────────────────────────────────────────
const mockFetch = jest.fn<typeof fetch>();
global.fetch = mockFetch;

// ── Mock renderTemplateSafe ────────────────────────────────────────────────────
jest.mock('@/platform/expressions/template-parser', () => ({
  renderTemplateSafe: jest.fn((tpl: string, ctx: { record: Record<string, unknown> }) => {
    // Simple replacement: {{ key }} → value
    const result = tpl.replace(/\{\{([^}]+)\}\}/g, (_m, key: string) => {
      const v = ctx.record[key.trim()];
      return v !== undefined ? String(v) : '';
    });
    return { result, errors: [] };
  }),
}));

import { EmailSender } from '../email-sender';
import { NotConfiguredError } from '../../secrets/manager';
import type { EmailConfig, EmailTemplate } from '../types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const smtpConfig: EmailConfig = {
  provider: 'smtp',
  fromAddress: 'no-reply@example.com',
  fromName: 'Test App',
  smtpHost: 'smtp.example.com',
  smtpPort: 587,
  smtpSecure: false,
  smtpUser: 'user@example.com',
  smtpPass: 'hunter2',
};

const resendConfig: EmailConfig = {
  provider: 'resend',
  fromAddress: 'hello@example.com',
  fromName: 'My App',
  resendApiKey: 're_test_key',
};

const sesConfig: EmailConfig = {
  provider: 'ses',
  fromAddress: 'no-reply@example.com',
  fromName: 'SES App',
  sesRegion: 'us-east-1',
  sesAccessKeyId: 'AKIAIOSFODNN7EXAMPLE',
  sesSecretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
};

const makeJsonResponse = (data: unknown, ok = true): Response =>
  ({
    ok,
    status: ok ? 200 : 422,
    statusText: ok ? 'OK' : 'Unprocessable Entity',
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
  }) as unknown as Response;

// ─── SMTP tests ───────────────────────────────────────────────────────────────

describe('EmailSender — SMTP', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSendMail.mockResolvedValue({ messageId: 'smtp-msg-id' });
  });

  it('calls createTransport with correct host/port', async () => {
    const sender = new EmailSender(smtpConfig);
    await sender.send({
      to: 'ravi@example.com',
      subject: 'Hello',
      bodyHtml: '<p>Hi Ravi</p>',
    });

    expect(mockCreateTransport).toHaveBeenCalledWith(
      expect.objectContaining({
        host: 'smtp.example.com',
        port: 587,
        secure: false,
      }),
    );
  });

  it('sends correct envelope fields', async () => {
    const sender = new EmailSender(smtpConfig);
    await sender.send({
      to: ['a@example.com', 'b@example.com'],
      cc: ['cc@example.com'],
      bcc: ['bcc@example.com'],
      subject: 'Test Subject',
      bodyHtml: '<p>Body</p>',
      bodyText: 'Body',
    });

    expect(mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        from: '"Test App" <no-reply@example.com>',
        to: ['a@example.com', 'b@example.com'],
        cc: ['cc@example.com'],
        bcc: ['bcc@example.com'],
        subject: 'Test Subject',
        html: '<p>Body</p>',
        text: 'Body',
      }),
    );
  });

  it('returns messageId, provider and sentAt', async () => {
    const sender = new EmailSender(smtpConfig);
    const result = await sender.send({
      to: 'x@example.com',
      subject: 'S',
      bodyHtml: '<p>H</p>',
    });

    expect(result.messageId).toBe('smtp-msg-id');
    expect(result.provider).toBe('smtp');
    expect(result.sentAt).toBeInstanceOf(Date);
  });

  it('includes base64 attachment in sendMail call', async () => {
    const sender = new EmailSender(smtpConfig);
    await sender.send({
      to: 'x@example.com',
      subject: 'With attachment',
      bodyHtml: '<p>See attached</p>',
      attachments: [
        {
          filename: 'invoice.pdf',
          content: Buffer.from('pdf-bytes').toString('base64'),
          contentType: 'application/pdf',
        },
      ],
    });

    expect(mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        attachments: expect.arrayContaining([
          expect.objectContaining({ filename: 'invoice.pdf', contentType: 'application/pdf' }),
        ]),
      }),
    );
  });

  it('throws NotConfiguredError when smtpHost is missing', async () => {
    const badConfig: EmailConfig = { ...smtpConfig, smtpHost: undefined };
    const sender = new EmailSender(badConfig);
    await expect(
      sender.send({ to: 'x@example.com', subject: 'S', bodyHtml: '<p></p>' }),
    ).rejects.toThrow(NotConfiguredError);
  });
});

// ─── Resend tests ─────────────────────────────────────────────────────────────

describe('EmailSender — Resend', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('calls correct Resend API URL with Bearer header', async () => {
    mockFetch.mockResolvedValueOnce(makeJsonResponse({ id: 'resend-abc' }));

    const sender = new EmailSender(resendConfig);
    await sender.send({ to: 'ravi@example.com', subject: 'Hi', bodyHtml: '<p>Hi</p>' });

    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.resend.com/emails',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer re_test_key',
          'Content-Type': 'application/json',
        }),
      }),
    );
  });

  it('returns messageId from Resend response', async () => {
    mockFetch.mockResolvedValueOnce(makeJsonResponse({ id: 'resend-xyz' }));

    const sender = new EmailSender(resendConfig);
    const result = await sender.send({ to: 'x@example.com', subject: 'S', bodyHtml: '<p></p>' });

    expect(result.messageId).toBe('resend-xyz');
    expect(result.provider).toBe('resend');
  });

  it('includes attachment in Resend payload', async () => {
    mockFetch.mockResolvedValueOnce(makeJsonResponse({ id: 'resend-attach' }));

    const sender = new EmailSender(resendConfig);
    await sender.send({
      to: 'x@example.com',
      subject: 'S',
      bodyHtml: '<p></p>',
      attachments: [
        { filename: 'doc.pdf', content: 'base64data', contentType: 'application/pdf' },
      ],
    });

    const body = JSON.parse(
      (mockFetch.mock.calls[0]?.[1] as RequestInit)?.body as string,
    ) as Record<string, unknown>;

    expect(body['attachments']).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ filename: 'doc.pdf', type: 'application/pdf' }),
      ]),
    );
  });

  it('throws on Resend API error response', async () => {
    mockFetch.mockResolvedValueOnce(makeJsonResponse({ message: 'invalid api key' }, false));

    const sender = new EmailSender(resendConfig);
    await expect(
      sender.send({ to: 'x@example.com', subject: 'S', bodyHtml: '<p></p>' }),
    ).rejects.toThrow('Resend API error: 422');
  });

  it('throws NotConfiguredError when resendApiKey is missing', async () => {
    const badConfig: EmailConfig = { ...resendConfig, resendApiKey: undefined };
    const sender = new EmailSender(badConfig);
    await expect(
      sender.send({ to: 'x@example.com', subject: 'S', bodyHtml: '<p></p>' }),
    ).rejects.toThrow(NotConfiguredError);
  });
});

// ─── SES tests ────────────────────────────────────────────────────────────────

describe('EmailSender — SES', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSendMail.mockResolvedValue({ messageId: 'ses-msg-id' });
  });

  it('uses SES SMTP endpoint for the configured region', async () => {
    const sender = new EmailSender(sesConfig);
    await sender.send({ to: 'x@example.com', subject: 'S', bodyHtml: '<p></p>' });

    expect(mockCreateTransport).toHaveBeenCalledWith(
      expect.objectContaining({ host: 'email-smtp.us-east-1.amazonaws.com' }),
    );
  });

  it('throws NotConfiguredError when sesRegion is missing', async () => {
    const bad: EmailConfig = { ...sesConfig, sesRegion: undefined };
    const sender = new EmailSender(bad);
    await expect(
      sender.send({ to: 'x@example.com', subject: 'S', bodyHtml: '<p></p>' }),
    ).rejects.toThrow(NotConfiguredError);
  });
});

// ─── Template rendering tests ─────────────────────────────────────────────────

describe('EmailSender — sendTemplate', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSendMail.mockResolvedValue({ messageId: 'tpl-msg-id' });
  });

  const template: EmailTemplate = {
    id: 'tpl-1',
    appId: 'app-1',
    name: 'order_ready',
    subject: 'Order for {{ customer.name }}',
    bodyHtml: '<p>Hi {{ customer.name }}, your order is ready!</p>',
  };

  it('renders {{ customer.name }} → "Ravi" in body', async () => {
    const sender = new EmailSender(smtpConfig);
    // The EvalContext.record keys map to expression variable names
    await sender.sendTemplate(template, { 'customer.name': 'Ravi' }, { to: 'ravi@example.com' });

    expect(mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        html: '<p>Hi Ravi, your order is ready!</p>',
      }),
    );
  });

  it('renders subject expression', async () => {
    const sender = new EmailSender(smtpConfig);
    await sender.sendTemplate(template, { 'customer.name': 'Priya' }, { to: 'priya@example.com' });

    expect(mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({ subject: 'Order for Priya' }),
    );
  });

  it('applies subject override over template', async () => {
    const sender = new EmailSender(smtpConfig);
    await sender.sendTemplate(template, { 'customer.name': 'Ravi' }, {
      to: 'ravi@example.com',
      subject: 'Override Subject',
    });

    expect(mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({ subject: 'Override Subject' }),
    );
  });
});
