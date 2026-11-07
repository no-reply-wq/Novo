/**
 * WhatsApp client tests — mocks fetch, verifies correct Meta API payload.
 */

jest.mock('../../lib/db/client', () => ({
  pgPool: { query: jest.fn() },
}));

jest.mock('../../platform/integrations/secrets/store', () => ({
  getSecretValue: jest.fn().mockResolvedValue('test-access-token'),
}));

import { pgPool } from '../../lib/db/client';
import { sendWhatsAppTemplate, sendWhatsAppText } from '../../platform/integrations/whatsapp/client';
import type { ConnectorDef } from '../../platform/contracts';

const mockPool = pgPool as jest.Mocked<typeof pgPool>;

const mockFetch = jest.fn();
global.fetch = mockFetch;

const waConnector: ConnectorDef = {
  id: 'conn-wa-1',
  appId: 'app-1',
  name: 'WhatsApp',
  kind: 'whatsapp_cloud',
  secrets: { accessToken: { secretId: 'sec-token', hint: 'oken' } },
  whatsapp: {
    phoneNumberId: 'phone-123',
    businessAccountId: 'biz-456',
  },
  enabled: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('sendWhatsAppTemplate', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (mockPool.query as jest.Mock).mockImplementation((sql: string) => {
      if (sql.includes('connector_defs')) return Promise.resolve({ rows: [{ data: waConnector }] });
      return Promise.resolve({ rows: [] });
    });
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ messages: [{ id: 'wamid.test123' }] }),
    });
  });

  it('POSTs to the correct Meta API URL', async () => {
    await sendWhatsAppTemplate({
      connectorId: 'conn-wa-1',
      to: '+919876543210',
      templateName: 'order_confirmed',
      languageCode: 'en_US',
      components: [],
    });

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/phone-123/messages'),
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('builds correct template message payload', async () => {
    await sendWhatsAppTemplate({
      connectorId: 'conn-wa-1',
      to: '+919876543210',
      templateName: 'order_confirmed',
      languageCode: 'en_US',
      components: [{ type: 'body', parameters: [{ type: 'text', text: 'ORD-001' }] }],
    });

    const callArgs = mockFetch.mock.calls[0];
    const body = JSON.parse((callArgs[1] as RequestInit).body as string);

    expect(body).toMatchObject({
      messaging_product: 'whatsapp',
      to: '+919876543210',
      type: 'template',
      template: {
        name: 'order_confirmed',
        language: { code: 'en_US' },
      },
    });
  });

  it('returns the messageId from Meta API', async () => {
    const result = await sendWhatsAppTemplate({
      connectorId: 'conn-wa-1',
      to: '+919876543210',
      templateName: 'hello_world',
      languageCode: 'en',
      components: [],
    });
    expect(result.messageId).toBe('wamid.test123');
  });
});

describe('sendWhatsAppText', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (mockPool.query as jest.Mock).mockImplementation((sql: string) => {
      if (sql.includes('connector_defs')) return Promise.resolve({ rows: [{ data: waConnector }] });
      return Promise.resolve({ rows: [] });
    });
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ messages: [{ id: 'wamid.text456' }] }),
    });
  });

  it('sends a text message payload', async () => {
    await sendWhatsAppText({ connectorId: 'conn-wa-1', to: '+919876543210', message: 'Hello!' });

    const body = JSON.parse((mockFetch.mock.calls[0][1] as RequestInit).body as string);
    expect(body).toMatchObject({
      messaging_product: 'whatsapp',
      to: '+919876543210',
      type: 'text',
      text: { body: 'Hello!' },
    });
  });
});
