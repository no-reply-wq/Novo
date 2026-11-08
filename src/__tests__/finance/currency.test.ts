/**
 * Tests for multi-currency formatting and conversion
 */

import { formatCurrency, getExchangeRate, convertAmount } from '@/platform/finance/currency';

// ─────────────────────────────────────────────────────────────
// formatCurrency
// ─────────────────────────────────────────────────────────────

describe('formatCurrency - INR', () => {
  it('formats INR with ₹ symbol and Indian comma style', () => {
    expect(formatCurrency(123456.78, 'INR')).toBe('₹1,23,456.78');
  });

  it('formats small INR amount', () => {
    expect(formatCurrency(1000, 'INR')).toBe('₹1,000.00');
  });

  it('formats INR below 1000', () => {
    expect(formatCurrency(500, 'INR')).toBe('₹500.00');
  });

  it('formats large INR crore amount', () => {
    expect(formatCurrency(10000000, 'INR')).toBe('₹1,00,00,000.00');
  });
});

describe('formatCurrency - USD', () => {
  it('formats USD with $ symbol', () => {
    expect(formatCurrency(1234.56, 'USD')).toBe('$1,234.56');
  });

  it('formats USD with correct decimal', () => {
    expect(formatCurrency(0.5, 'USD')).toBe('$0.50');
  });
});

describe('formatCurrency - other currencies', () => {
  it('formats EUR with € symbol', () => {
    expect(formatCurrency(1000, 'EUR')).toBe('€1,000.00');
  });

  it('formats GBP with £ symbol', () => {
    expect(formatCurrency(500, 'GBP')).toBe('£500.00');
  });

  it('uses currency code prefix for unknown currencies', () => {
    const result = formatCurrency(100, 'BTC');
    expect(result).toContain('BTC');
    expect(result).toContain('100.00');
  });
});

// ─────────────────────────────────────────────────────────────
// getExchangeRate — same currency
// ─────────────────────────────────────────────────────────────

describe('getExchangeRate', () => {
  it('returns 1 for same currency pair', async () => {
    const rate = await getExchangeRate('INR', 'INR');
    expect(rate).toBe(1);
  });

  it('returns 1 for same currency regardless of case', async () => {
    const rate = await getExchangeRate('usd', 'USD');
    expect(rate).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────
// convertAmount — deterministic (same currency)
// ─────────────────────────────────────────────────────────────

describe('convertAmount', () => {
  it('converts same currency amount without change', async () => {
    const mockPool = {
      query: jest.fn().mockResolvedValue({ rows: [] }),
    } as unknown as import('pg').Pool;

    // For same currency, getExchangeRate returns 1 without DB call
    const result = await convertAmount(1000, 'INR', 'INR', '2024-01-01', mockPool);
    expect(result).toBe(1000);
  });

  it('rounds to 2 decimal places', async () => {
    const mockPool = {
      query: jest.fn().mockResolvedValue({ rows: [{ rate: '83.123456' }] }),
    } as unknown as import('pg').Pool;

    const result = await convertAmount(100, 'USD', 'INR', '2024-01-01', mockPool);
    // 100 * 83.123456 = 8312.3456 → 8312.35
    expect(result).toBe(8312.35);
  });
});
