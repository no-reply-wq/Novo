import { IRPClient } from '../client';
import { NotConfiguredError } from '../../secrets/manager';
import type { EInvoiceConfig, EInvoicePayload } from '../types';

// Mock global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch as typeof fetch;

const validConfig: EInvoiceConfig = {
  gstin: '27AAAAA0000A1Z5',
  username: 'testuser',
  password: 'testpass',
  sandbox: true,
  clientId: 'client123',
  clientSecret: 'secret456',
};

const futureExpiry = new Date(Date.now() + 3_600_000).toISOString().replace('T', ' ').slice(0, 19);

const authSuccessResponse = {
  Status: '1',
  Info: {
    AuthToken: 'token-abc123',
    TokenExpiry: futureExpiry,
    UserGstin: '27AAAAA0000A1Z5',
    Sek: 'sek-value',
  },
};

const generateSuccessResponse = {
  Status: '1',
  Info: {
    Irn: 'a'.repeat(64),
    AckNo: '132310001234567',
    AckDt: '2024-01-15 10:30:00',
    SignedQRCode: 'base64qrcode',
    SignedInvoice: 'base64invoice',
    Status: 'ACT',
  },
};

const minimalPayload: EInvoicePayload = {
  version: '1.1',
  tranDtls: { taxSch: 'GST', supTyp: 'B2B', regRev: 'N' },
  docDtls: { typ: 'INV', no: 'INV-001', dt: '15/01/2024' },
  sellerDtls: { gstin: '27AAAAA0000A1Z5', lglNm: 'Seller', addr1: 'Addr', loc: 'City', pin: 400001, stcd: '27' },
  buyerDtls: { gstin: '29BBBBB0000B1Z6', lglNm: 'Buyer', pos: '29', addr1: 'Addr', loc: 'City', pin: 560001, stcd: '29' },
  itemList: [],
  valDtls: { assVal: 10000, cgstVal: 0, sgstVal: 0, igstVal: 1800, totInvVal: 11800 },
};

function makeJsonResponse(data: unknown, status = 200) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
  }) as ReturnType<typeof fetch>;
}

beforeEach(() => {
  mockFetch.mockReset();
});

describe('IRPClient constructor', () => {
  it('throws NotConfiguredError when GSTIN is missing', () => {
    expect(() => new IRPClient({ ...validConfig, gstin: '' })).toThrow(NotConfiguredError);
  });

  it('throws NotConfiguredError when username is missing', () => {
    expect(() => new IRPClient({ ...validConfig, username: '' })).toThrow(NotConfiguredError);
  });

  it('throws NotConfiguredError when clientId is missing', () => {
    expect(() => new IRPClient({ ...validConfig, clientId: '' })).toThrow(NotConfiguredError);
  });

  it('uses sandbox URL when sandbox=true', () => {
    const client = new IRPClient({ ...validConfig, sandbox: true });
    // Accessing private via casting — just verify it constructs without error
    expect(client).toBeInstanceOf(IRPClient);
  });

  it('constructs successfully with valid config', () => {
    expect(() => new IRPClient(validConfig)).not.toThrow();
  });
});

describe('IRPClient.authenticate()', () => {
  it('sends correct POST body with credentials', async () => {
    mockFetch.mockReturnValueOnce(makeJsonResponse(authSuccessResponse));

    const client = new IRPClient(validConfig);
    await client.authenticate();

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/eivital/v1.03/Auth');
    const body = JSON.parse(opts.body as string) as Record<string, unknown>;
    expect(body).toMatchObject({
      UserName: 'testuser',
      Password: 'testpass',
      AppKey: 'secret456',
      ForceRefreshAccessToken: true,
    });
  });

  it('caches the auth token after successful auth', async () => {
    mockFetch
      .mockReturnValueOnce(makeJsonResponse(authSuccessResponse))
      .mockReturnValueOnce(makeJsonResponse(generateSuccessResponse));

    const client = new IRPClient(validConfig);
    await client.generateIRN(minimalPayload);

    // Only 1 auth call should have been made
    const authCalls = mockFetch.mock.calls.filter(([url]) =>
      (url as string).includes('/Auth'),
    );
    expect(authCalls).toHaveLength(1);
  });

  it('throws when auth response Status is not 1', async () => {
    mockFetch.mockReturnValueOnce(
      makeJsonResponse({ Status: '0', ErrorDetails: [{ ErrorCode: 'ERR001', ErrorMessage: 'Invalid credentials' }] }),
    );

    const client = new IRPClient(validConfig);
    await expect(client.authenticate()).rejects.toThrow('ERR001');
  });
});

describe('IRPClient.generateIRN()', () => {
  it('includes authtoken header in request', async () => {
    mockFetch
      .mockReturnValueOnce(makeJsonResponse(authSuccessResponse))
      .mockReturnValueOnce(makeJsonResponse(generateSuccessResponse));

    const client = new IRPClient(validConfig);
    await client.generateIRN(minimalPayload);

    const [, opts] = mockFetch.mock.calls[1] as [string, RequestInit];
    const headers = opts.headers as Record<string, string>;
    expect(headers['authtoken']).toBe('token-abc123');
    expect(headers['user_name']).toBe('testuser');
    expect(headers['gstin']).toBe('27AAAAA0000A1Z5');
  });

  it('parses IRN response correctly', async () => {
    mockFetch
      .mockReturnValueOnce(makeJsonResponse(authSuccessResponse))
      .mockReturnValueOnce(makeJsonResponse(generateSuccessResponse));

    const client = new IRPClient(validConfig);
    const result = await client.generateIRN(minimalPayload);

    expect(result.irn).toBe('a'.repeat(64));
    expect(result.ackNo).toBe('132310001234567');
    expect(result.ackDt).toBe('2024-01-15 10:30:00');
    expect(result.signedQrCode).toBe('base64qrcode');
    expect(result.status).toBe('ACT');
  });

  it('re-authenticates when token is expired', async () => {
    // First auth gives expired token
    const expiredResponse = {
      ...authSuccessResponse,
      Info: {
        ...authSuccessResponse.Info,
        TokenExpiry: '2000-01-01 00:00:00',
      },
    };

    mockFetch
      .mockReturnValueOnce(makeJsonResponse(expiredResponse)) // first auth
      .mockReturnValueOnce(makeJsonResponse(authSuccessResponse)) // re-auth
      .mockReturnValueOnce(makeJsonResponse(generateSuccessResponse)); // generate

    const client = new IRPClient(validConfig);
    await client.authenticate(); // prime with expired token
    await client.generateIRN(minimalPayload);

    // Should have called auth twice total
    const authCalls = mockFetch.mock.calls.filter(([url]) =>
      (url as string).includes('/Auth'),
    );
    expect(authCalls).toHaveLength(2);
  });

  it('throws on HTTP error response', async () => {
    mockFetch
      .mockReturnValueOnce(makeJsonResponse(authSuccessResponse))
      .mockReturnValueOnce(
        Promise.resolve({
          ok: false,
          status: 500,
          text: () => Promise.resolve('Internal Server Error'),
        }) as ReturnType<typeof fetch>,
      );

    const client = new IRPClient(validConfig);
    await expect(client.generateIRN(minimalPayload)).rejects.toThrow('HTTP 500');
  });
});

describe('IRPClient.getIRNByDocDetails()', () => {
  it('returns null when IRP responds 404', async () => {
    mockFetch
      .mockReturnValueOnce(makeJsonResponse(authSuccessResponse))
      .mockReturnValueOnce(
        Promise.resolve({
          ok: false,
          status: 404,
          text: () => Promise.resolve('Not found'),
        }) as ReturnType<typeof fetch>,
      );

    const client = new IRPClient(validConfig);
    const result = await client.getIRNByDocDetails('INV', 'INV-001', '15/01/2024');
    expect(result).toBeNull();
  });

  it('returns EInvoiceResponse when found', async () => {
    mockFetch
      .mockReturnValueOnce(makeJsonResponse(authSuccessResponse))
      .mockReturnValueOnce(makeJsonResponse(generateSuccessResponse));

    const client = new IRPClient(validConfig);
    const result = await client.getIRNByDocDetails('INV', 'INV-001', '15/01/2024');
    expect(result).not.toBeNull();
    expect(result?.irn).toBe('a'.repeat(64));
  });
});

describe('IRPClient.cancelIRN()', () => {
  it('sends correct cancel body', async () => {
    mockFetch
      .mockReturnValueOnce(makeJsonResponse(authSuccessResponse))
      .mockReturnValueOnce(makeJsonResponse({ Status: '1' }));

    const client = new IRPClient(validConfig);
    await client.cancelIRN('irn123', 1, 'duplicate');

    const [url, opts] = mockFetch.mock.calls[1] as [string, RequestInit];
    expect(url).toContain('/Invoice/Cancel');
    const body = JSON.parse(opts.body as string) as Record<string, unknown>;
    expect(body).toMatchObject({ Irn: 'irn123', CnlRsn: 1, CnlRem: 'duplicate' });
  });

  it('throws when cancel fails', async () => {
    mockFetch
      .mockReturnValueOnce(makeJsonResponse(authSuccessResponse))
      .mockReturnValueOnce(
        makeJsonResponse({ Status: '0', ErrorDetails: [{ ErrorCode: 'ERR002', ErrorMessage: 'Cancel not allowed' }] }),
      );

    const client = new IRPClient(validConfig);
    await expect(client.cancelIRN('irn123', 1, 'test')).rejects.toThrow('ERR002');
  });
});
