import crypto from 'crypto';
import { createRazorpayOrder, verifyRazorpaySignature, handleRazorpayWebhook } from '../razorpay';

describe('createRazorpayOrder', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    process.env['RAZORPAY_KEY_ID'] = 'rzp_test_key';
    process.env['RAZORPAY_KEY_SECRET'] = 'rzp_secret';
    process.env['RAZORPAY_WEBHOOK_SECRET'] = 'wh_secret';
  });

  afterEach(() => {
    global.fetch = originalFetch;
    delete process.env['RAZORPAY_KEY_ID'];
    delete process.env['RAZORPAY_KEY_SECRET'];
    delete process.env['RAZORPAY_WEBHOOK_SECRET'];
  });

  it('calls Razorpay API with correct Basic auth and body', async () => {
    const mockResponse = {
      id: 'order_abc123',
      amount: 50000,
      currency: 'INR',
      status: 'created',
    };

    let capturedRequest: Request | undefined;
    global.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      capturedRequest = new Request(input as string, init);
      return new Response(JSON.stringify(mockResponse), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    const result = await createRazorpayOrder({
      tenantSlug: 'acme',
      amount: 50000,
      currency: 'INR',
      receipt: 'rcpt_001',
    });

    expect(result.orderId).toBe('order_abc123');
    expect(result.amount).toBe(50000);
    expect(result.currency).toBe('INR');

    // Verify Basic auth
    const expectedAuth = `Basic ${Buffer.from('rzp_test_key:rzp_secret').toString('base64')}`;
    expect(capturedRequest?.headers.get('Authorization')).toBe(expectedAuth);
    expect(capturedRequest?.method).toBe('POST');
    expect(capturedRequest?.url).toContain('/v1/orders');

    // Verify body
    const body = await capturedRequest?.text();
    const parsed = JSON.parse(body ?? '{}') as Record<string, unknown>;
    expect(parsed['amount']).toBe(50000);
    expect(parsed['currency']).toBe('INR');
    expect(parsed['receipt']).toBe('rcpt_001');
  });

  it('throws NotConfiguredError when credentials are missing', async () => {
    delete process.env['RAZORPAY_KEY_ID'];
    delete process.env['RAZORPAY_KEY_SECRET'];

    await expect(
      createRazorpayOrder({ tenantSlug: 'acme', amount: 10000 })
    ).rejects.toThrow('not configured');
  });

  it('throws on non-200 Razorpay response', async () => {
    global.fetch = async () => new Response('Bad Request', { status: 400 });

    await expect(
      createRazorpayOrder({ tenantSlug: 'acme', amount: 10000 })
    ).rejects.toThrow('400');
  });
});

describe('verifyRazorpaySignature', () => {
  it('returns true for a correct HMAC-SHA256 signature', async () => {
    const keySecret = 'test_secret';
    const orderId = 'order_123';
    const paymentId = 'pay_456';
    const signature = crypto
      .createHmac('sha256', keySecret)
      .update(`${orderId}|${paymentId}`)
      .digest('hex');

    const result = await verifyRazorpaySignature({ orderId, paymentId, signature, keySecret });
    expect(result).toBe(true);
  });

  it('returns false for an incorrect signature', async () => {
    const result = await verifyRazorpaySignature({
      orderId: 'order_123',
      paymentId: 'pay_456',
      signature: 'a'.repeat(64),
      keySecret: 'test_secret',
    });
    expect(result).toBe(false);
  });
});

describe('handleRazorpayWebhook', () => {
  const webhookSecret = 'webhook_secret_xyz';

  function makeSignature(body: string): string {
    return crypto.createHmac('sha256', webhookSecret).update(body).digest('hex');
  }

  it('returns parsed event for valid signature', async () => {
    const payload = {
      entity: 'event',
      account_id: 'acc_123',
      event: 'payment.captured',
      contains: ['payment'],
      payload: {
        payment: {
          entity: {
            id: 'pay_abc',
            order_id: 'order_xyz',
            amount: 10000,
            currency: 'INR',
            status: 'captured',
          },
        },
      },
    };
    const body = JSON.stringify(payload);
    const signature = makeSignature(body);

    const result = await handleRazorpayWebhook(body, signature, webhookSecret);
    expect(result.event).toBe('payment.captured');
    expect(result.payload.payment?.entity.id).toBe('pay_abc');
  });

  it('throws for invalid signature', async () => {
    const body = JSON.stringify({ event: 'payment.captured' });
    await expect(
      handleRazorpayWebhook(body, 'invalidsig', webhookSecret)
    ).rejects.toThrow('signature verification failed');
  });
});
