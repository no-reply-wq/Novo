import crypto from 'crypto';
import { createStripePaymentIntent, handleStripeWebhook } from '../stripe';

describe('createStripePaymentIntent', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    process.env['STRIPE_SECRET_KEY'] = 'sk_test_abc123';
  });

  afterEach(() => {
    global.fetch = originalFetch;
    delete process.env['STRIPE_SECRET_KEY'];
  });

  it('calls Stripe API with Bearer auth and URL-encoded body', async () => {
    const mockResponse = {
      id: 'pi_test_123',
      client_secret: 'pi_test_123_secret_xyz',
      amount: 2000,
      currency: 'usd',
      status: 'requires_payment_method',
    };

    let capturedRequest: Request | undefined;
    global.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      capturedRequest = new Request(input as string, init);
      return new Response(JSON.stringify(mockResponse), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    const result = await createStripePaymentIntent({
      tenantSlug: 'acme',
      amount: 2000,
      currency: 'usd',
      metadata: { orderId: 'ord_001' },
    });

    expect(result.clientSecret).toBe('pi_test_123_secret_xyz');
    expect(result.paymentIntentId).toBe('pi_test_123');

    // Verify Bearer auth
    expect(capturedRequest?.headers.get('Authorization')).toBe('Bearer sk_test_abc123');
    expect(capturedRequest?.method).toBe('POST');
    expect(capturedRequest?.url).toContain('/v1/payment_intents');
    expect(capturedRequest?.headers.get('Content-Type')).toBe('application/x-www-form-urlencoded');

    // Verify URL-encoded body
    const body = await capturedRequest?.text();
    expect(body).toContain('amount=2000');
    expect(body).toContain('currency=usd');
    expect(body).toContain('metadata%5BorderId%5D=ord_001');
  });

  it('throws NotConfiguredError when secret key is missing', async () => {
    delete process.env['STRIPE_SECRET_KEY'];

    await expect(
      createStripePaymentIntent({ tenantSlug: 'acme', amount: 1000 })
    ).rejects.toThrow('not configured');
  });

  it('defaults currency to usd', async () => {
    global.fetch = async () =>
      new Response(
        JSON.stringify({ id: 'pi_1', client_secret: 'secret', amount: 500, currency: 'usd', status: 'created' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );

    const result = await createStripePaymentIntent({ tenantSlug: 'acme', amount: 500 });
    expect(result.paymentIntentId).toBe('pi_1');
  });
});

describe('handleStripeWebhook', () => {
  const webhookSecret = 'whsec_test_xyz';

  function makeStripeSignature(body: string, secret: string, timestamp = Math.floor(Date.now() / 1000)): string {
    const signedPayload = `${timestamp}.${body}`;
    const sig = crypto.createHmac('sha256', secret).update(signedPayload).digest('hex');
    return `t=${timestamp},v1=${sig}`;
  }

  it('parses event for valid Stripe signature format', async () => {
    const payload = {
      id: 'evt_123',
      object: 'event',
      type: 'payment_intent.succeeded',
      data: { object: { id: 'pi_123', amount: 2000 } },
      created: 1700000000,
      livemode: false,
    };
    const body = JSON.stringify(payload);
    const signature = makeStripeSignature(body, webhookSecret);

    const result = await handleStripeWebhook(body, signature, webhookSecret);
    expect(result.type).toBe('payment_intent.succeeded');
    expect(result.id).toBe('evt_123');
  });

  it('throws for invalid signature', async () => {
    const body = JSON.stringify({ type: 'payment_intent.succeeded' });
    const badSig = 't=12345,v1=invalidsignature';
    await expect(handleStripeWebhook(body, badSig, webhookSecret)).rejects.toThrow('signature verification failed');
  });

  it('throws for malformed signature header', async () => {
    const body = JSON.stringify({ type: 'test' });
    await expect(handleStripeWebhook(body, 'notvalid', webhookSecret)).rejects.toThrow('Invalid Stripe webhook signature header format');
  });
});
