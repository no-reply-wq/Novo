/**
 * Tests for email sender — mocks SMTP transport and DB, asserts envelope fields.
 */

import { jest } from '@jest/globals';

// ── Mock nodemailer ────────────────────────────────────────────────────────────
const mockSendMail = jest.fn<() => Promise<{ messageId: string }>>().mockResolvedValue({
  messageId: 'test-message-id-123',
});
const mockCreateTransport = jest.fn(() => ({ sendMail: mockSendMail }));

jest.mock('nodemailer', () => ({
  __esModule: true,
  default: { createTransport: mockCreateTransport },
}));

// ── Mock DB pool ───────────────────────────────────────────────────────────────
const mockQuery = jest.fn<(sql: unknown, params?: unknown[]) => Promise<{ rows: unknown[] }>>().mockResolvedValue({ rows: [] });
jest.mock('@/lib/db/client', () => ({
  pgPool: { query: mockQuery },
}));

// ── Mock secrets store ─────────────────────────────────────────────────────────
jest.mock('../../secrets/store', () => ({
  getSecretValue: jest.fn<(ref: { secretId: string }) => Promise<string>>().mockImplementation(async (ref: { secretId: string }) => {
    if (ref.secretId === 'secret-user') return 'smtp@example.com';
    if (ref.secretId === 'secret-pass') return 'hunter2';
    return 'mock-secret';
  }),
}));

import { sendEmail } from '../sender';
import type { ConnectorDef } from '@/platform/contracts';

const smtpConnector: ConnectorDef = {
  id: 'conn-1',
  appId: 'app-1',
  name: 'Test SMTP',
  kind: 'email_smtp',
  secrets: {
    smtpUser: { secretId: 'secret-user' },
    smtpPassword: { secretId: 'secret-pass' },
  },
  email: {
    host: 'smtp.example.com',
    port: 587,
    secure: false,
    fromAddress: 'no-reply@example.com',
    fromName: 'Test App',
  },
  enabled: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('sendEmail via SMTP', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // loadConnectorDef query returns the connector
    mockQuery.mockImplementation(async (sql: unknown) => {
      const sqlStr = String(sql);
      if (sqlStr.includes('connector_defs')) {
        return { rows: [{ data: smtpConnector }] };
      }
      // email_log insert
      return { rows: [] };
    });

    mockSendMail.mockResolvedValue({ messageId: 'test-msg-id' });
  });

  it('calls nodemailer createTransport with correct host/port', async () => {
    await sendEmail({
      connectorId: 'conn-1',
      to: 'customer@example.com',
      subject: 'Hello',
      htmlBody: '<p>Hello</p>',
    });

    expect(mockCreateTransport).toHaveBeenCalledWith(
      expect.objectContaining({
        host: 'smtp.example.com',
        port: 587,
        secure: false,
      })
    );
  });

  it('passes correct envelope fields to sendMail', async () => {
    await sendEmail({
      connectorId: 'conn-1',
      to: ['a@example.com', 'b@example.com'],
      subject: 'Test Subject',
      htmlBody: '<p>Body</p>',
      textBody: 'Body',
      replyTo: 'reply@example.com',
    });

    expect(mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        from: '"Test App" <no-reply@example.com>',
        to: ['a@example.com', 'b@example.com'],
        subject: 'Test Subject',
        html: '<p>Body</p>',
        text: 'Body',
        replyTo: 'reply@example.com',
      })
    );
  });

  it('returns messageId from nodemailer', async () => {
    const result = await sendEmail({
      connectorId: 'conn-1',
      to: 'x@example.com',
      subject: 'S',
      htmlBody: '<p>H</p>',
    });

    expect(result.messageId).toBe('test-msg-id');
  });

  it('logs sent email to email_log table', async () => {
    await sendEmail({
      connectorId: 'conn-1',
      to: 'log@example.com',
      subject: 'Log Test',
      htmlBody: '<p>Log</p>',
    });

    const logCall = mockQuery.mock.calls.find(
      (call) => String(call[0]).includes('email_log')
    );
    expect(logCall).toBeDefined();
  });

  it('logs failure status when sendMail throws', async () => {
    mockSendMail.mockRejectedValueOnce(new Error('SMTP connection refused'));

    await expect(
      sendEmail({
        connectorId: 'conn-1',
        to: 'err@example.com',
        subject: 'Fail',
        htmlBody: '<p>Fail</p>',
      })
    ).rejects.toThrow('SMTP connection refused');

    const logCall = mockQuery.mock.calls.find((call) => {
      const sql = String(call[0]);
      const params = call[1];
      return sql.includes('email_log') && Array.isArray(params) && params[5] === 'failed';
    });
    expect(logCall).toBeDefined();
  });
});
