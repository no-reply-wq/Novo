import { EWayBillClient } from '../client';
import { NotConfiguredError } from '../../secrets/manager';
import type { EWayBillConfig, EWayBillPayload } from '../types';

const SANDBOX_CONFIG: EWayBillConfig = {
  gstin: '27AAPFU0939F1ZV',
  username: 'testuser',
  password: 'testpass',
  sandbox: true,
};

const SAMPLE_PAYLOAD: EWayBillPayload = {
  supplyType: 'O',
  subSupplyType: '1',
  docType: 'INV',
  docNo: 'INV-001',
  docDate: '15/01/2024',
  fromGstin: '27AAPFU0939F1ZV',
  fromTrdName: 'Acme Corp',
  fromAddr1: '123 MG Road',
  fromPlace: 'Mumbai',
  fromPincode: 400001,
  fromStateCode: 27,
  toGstin: '33AAPFU0939F1ZV',
  toTrdName: 'Beta Ltd',
  toAddr1: '456 Anna Salai',
  toPlace: 'Chennai',
  toPincode: 600001,
  toStateCode: 33,
  transactionType: 1,
  transDistance: '1500',
  transMode: '1',
  vehicleNo: 'MH12AB1234',
  itemList: [
    {
      itemNo: 1,
      productName: 'Steel Rods',
      hsnCode: '7213',
      quantity: 10,
      qtyUnit: 'NOS',
      cgstRate: 0,
      sgstRate: 0,
      igstRate: 18,
      taxableAmount: 50000,
    },
  ],
};

describe('EWayBillClient — constructor', () => {
  it('throws NotConfiguredError when GSTIN is missing', () => {
    expect(() => {
      new EWayBillClient({ ...SANDBOX_CONFIG, gstin: '' });
    }).toThrow(NotConfiguredError);
  });

  it('throws NotConfiguredError when username is missing', () => {
    expect(() => {
      new EWayBillClient({ ...SANDBOX_CONFIG, username: '' });
    }).toThrow(NotConfiguredError);
  });

  it('throws NotConfiguredError when password is missing', () => {
    expect(() => {
      new EWayBillClient({ ...SANDBOX_CONFIG, password: '' });
    }).toThrow(NotConfiguredError);
  });

  it('constructs successfully with valid config', () => {
    expect(() => new EWayBillClient(SANDBOX_CONFIG)).not.toThrow();
  });
});

describe('EWayBillClient — authenticate()', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('sends correct body with appid=authenticate', async () => {
    let capturedBody: unknown;
    global.fetch = async (_input: RequestInfo | URL, init?: RequestInit) => {
      capturedBody = JSON.parse(init?.body as string);
      return new Response(
        JSON.stringify({ status: '1', authtoken: 'tok_abc', sek: 'sek_abc' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    };

    const client = new EWayBillClient(SANDBOX_CONFIG);
    await client.authenticate();

    expect(capturedBody).toEqual({
      gstin: '27AAPFU0939F1ZV',
      username: 'testuser',
      password: 'testpass',
      appid: 'authenticate',
    });
  });

  it('targets sandbox URL', async () => {
    let capturedUrl = '';
    global.fetch = async (input: RequestInfo | URL, _init?: RequestInit) => {
      capturedUrl = String(input);
      return new Response(
        JSON.stringify({ status: '1', authtoken: 'tok_abc', sek: 'sek_abc' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    };

    const client = new EWayBillClient(SANDBOX_CONFIG);
    await client.authenticate();

    expect(capturedUrl).toContain('ewaybillsandbox.nic.in');
    expect(capturedUrl).toContain('/ewb/authenticate');
  });

  it('targets production URL when sandbox=false', async () => {
    let capturedUrl = '';
    global.fetch = async (input: RequestInfo | URL, _init?: RequestInit) => {
      capturedUrl = String(input);
      return new Response(
        JSON.stringify({ status: '1', authtoken: 'tok_prod', sek: 'sek_prod' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    };

    const client = new EWayBillClient({ ...SANDBOX_CONFIG, sandbox: false });
    await client.authenticate();

    expect(capturedUrl).toContain('ewaybillgst.gov.in');
  });

  it('caches token and does not re-authenticate on second call', async () => {
    let callCount = 0;
    global.fetch = async (_input: RequestInfo | URL, _init?: RequestInit) => {
      callCount++;
      return new Response(
        JSON.stringify({ status: '1', authtoken: 'tok_cache', sek: 'sek_cache' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    };

    const client = new EWayBillClient(SANDBOX_CONFIG);
    await client.authenticate();
    await client.authenticate();

    expect(callCount).toBe(1);
  });

  it('throws on non-ok HTTP response', async () => {
    global.fetch = async () =>
      new Response('Unauthorized', { status: 401 });

    const client = new EWayBillClient(SANDBOX_CONFIG);
    await expect(client.authenticate()).rejects.toThrow(/401/);
  });

  it('throws when status is not "1"', async () => {
    global.fetch = async () =>
      new Response(JSON.stringify({ status: '0', error: 'invalid credentials' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });

    const client = new EWayBillClient(SANDBOX_CONFIG);
    await expect(client.authenticate()).rejects.toThrow(/rejected/);
  });
});

describe('EWayBillClient — generateEWB()', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  function mockFetch(authToken = 'tok_gen') {
    let callCount = 0;
    global.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      callCount++;
      const url = String(input);
      if (url.includes('/authenticate')) {
        return new Response(
          JSON.stringify({ status: '1', authtoken: authToken, sek: 'sek' }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      // generate endpoint
      return new Response(
        JSON.stringify({
          status: '1',
          data: {
            ewbNo: '123456789012',
            ewbDt: '15/01/2024 10:00:00',
            ewbValidTill: '17/01/2024 23:59:00',
            status: 'GENERATED',
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    };
    return { getCallCount: () => callCount };
  }

  it('includes authtoken header in generate request', async () => {
    let generateHeaders: Headers | undefined;
    global.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const req = new Request(url, init);
      if (url.includes('/authenticate')) {
        return new Response(
          JSON.stringify({ status: '1', authtoken: 'tok_hdr', sek: 'sek' }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      generateHeaders = req.headers;
      return new Response(
        JSON.stringify({
          status: '1',
          data: {
            ewbNo: '123456789012',
            ewbDt: '15/01/2024 10:00:00',
            ewbValidTill: '17/01/2024 23:59:00',
            status: 'GENERATED',
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    };

    const client = new EWayBillClient(SANDBOX_CONFIG);
    await client.generateEWB(SAMPLE_PAYLOAD);

    expect(generateHeaders?.get('authtoken')).toBe('tok_hdr');
    expect(generateHeaders?.get('gstin')).toBe('27AAPFU0939F1ZV');
  });

  it('returns EWayBillResponse with ewbNo', async () => {
    mockFetch();
    const client = new EWayBillClient(SANDBOX_CONFIG);
    const result = await client.generateEWB(SAMPLE_PAYLOAD);

    expect(result.ewbNo).toBe('123456789012');
    expect(result.ewbValidTill).toBe('17/01/2024 23:59:00');
  });
});

describe('EWayBillClient — cancelEWB()', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('sends correct cancel reason code', async () => {
    let capturedBody: unknown;
    global.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/authenticate')) {
        return new Response(
          JSON.stringify({ status: '1', authtoken: 'tok_cancel', sek: 'sek' }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      capturedBody = JSON.parse(init?.body as string);
      return new Response(JSON.stringify({ status: '1', data: {} }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    const client = new EWayBillClient(SANDBOX_CONFIG);
    await client.cancelEWB({
      ewbNo: '123456789012',
      cancelRsnCode: 1,
      cancelRmrk: 'Duplicate entry',
    });

    expect(capturedBody).toEqual({
      ewbNo: '123456789012',
      cancelRsnCode: 1,
      cancelRmrk: 'Duplicate entry',
    });
  });
});
