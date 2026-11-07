/**
 * Email sender tests — mocks nodemailer, verifies correct params.
 * No real SMTP connection needed.
 */

// Mock the DB and secrets store before imports
jest.mock('../../lib/db/client', () => ({
  pgPool: {
    query: jest.fn(),
  },
}));

jest.mock('../../platform/integrations/secrets/store', () => ({
  getSecretValue: jest.fn().mockResolvedValue('smtp-password'),
}));

const mockSendMail = jest.fn().mockResolvedValue({ messageId: 'test-message-id-123' });
const mockCreateTransport = jest.fn().mockReturnValue({ sendMail: mockSendMail });

jest.mock('nodemailer', () => ({
  createTransport: (...args: unknown[]) => mockCreateTransport(...args),
}));

import { pgPool } from '../../lib/db/client';
import { sendEmail } from '../../platform/integrations/email/sender';
import type { ConnectorDef } from '../../platform/contracts';

const mockPool = pgPool as jest.Mocked<typeof pgPool>;

const smtpConnector: ConnectorDef = {
  id: 'conn-1',
  appId: 'app-1',
  name: 'Test SMTP',
  kind: 'email_smtp',
  secrets: { smtpUser: { secretId: 'sec-1', hint: 'user' }, smtpPassword: { secretId: 'sec-2', hint: 'pass' } },
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
    // Mock connector load
    (mockPool.query as jest.Mock).mockImplementation((sql: string) => {
      if (sql.includes('connector_defs')) {
        return Promise.resolve({ rows: [{ data: smtpConnector }] });
      }
      // email_log insert
      return Promise.resolve({ rows: [] });
    });
  });

  it('calls nodemailer createTransport with correct host/port', async () => {
    await sendEmail({
      connectorId: 'conn-1',
      to: 'user@example.com',
      subject: 'Hello',
      htmlBody: '<p>Hi</p>',
    });

    expect(mockCreateTransport).toHaveBeenCalledWith(
      expect.objectContaining({
        host: 'smtp.example.com',
        port: 587,
        secure: false,
      }),
    );
  });

  it('sends mail with correct to/subject/html', async () => {
    await sendEmail({
      connectorId: 'conn-1',
      to: ['a@example.com', 'b@example.com'],
      subject: 'Test Subject',
      htmlBody: '<h1>Test</h1>',
      textBody: 'Test',
    });

    expect(mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: ['a@example.com', 'b@example.com'],
        subject: 'Test Subject',
        html: '<h1>Test</h1>',
        text: 'Test',
        from: '"Test App" <no-reply@example.com>',
      }),
    );
  });

  it('returns the messageId from nodemailer', async () => {
    const result = await sendEmail({
      connectorId: 'conn-1',
      to: 'user@example.com',
      subject: 'Hi',
      htmlBody: '<p>Hi</p>',
    });
    expect(result.messageId).toBe('test-message-id-123');
  });
});
