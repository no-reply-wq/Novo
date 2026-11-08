/**
 * Multi-currency support — exchange rates, conversion, formatting
 */

import { Pool } from 'pg';
import { randomUUID } from 'crypto';

export interface ExchangeRate {
  from: string;
  to: string;
  rate: number;
  date: string;
}

// ─────────────────────────────────────────────────────────────
// DB cache lookup + API fallback
// ─────────────────────────────────────────────────────────────

export async function getExchangeRate(
  from: string,
  to: string,
  date?: string,
  pgPool?: Pool,
): Promise<number> {
  if (from.toUpperCase() === to.toUpperCase()) return 1;

  const rateDate = date ?? new Date().toISOString().slice(0, 10);

  if (pgPool) {
    try {
      const cached = await pgPool.query<{ rate: string }>(
        `SELECT rate FROM platform.exchange_rates
          WHERE from_currency = $1 AND to_currency = $2 AND rate_date = $3
          LIMIT 1`,
        [from.toUpperCase(), to.toUpperCase(), rateDate],
      );
      if (cached.rows.length > 0) {
        return Number(cached.rows[0].rate);
      }
    } catch {
      // table might not exist in test environments
    }
  }

  // Fetch from exchangerate.host (free, no key required)
  try {
    const url = `https://api.exchangerate.host/convert?from=${from}&to=${to}&date=${rateDate}`;
    const res = await fetch(url);
    if (res.ok) {
      const data = (await res.json()) as { result?: number; info?: { rate?: number } };
      const rate = data.result ?? data.info?.rate ?? 0;

      // Cache in DB if pool available
      if (pgPool && rate > 0) {
        await pgPool
          .query(
            `INSERT INTO platform.exchange_rates (id, from_currency, to_currency, rate, rate_date)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (from_currency, to_currency, rate_date) DO NOTHING`,
            [randomUUID(), from.toUpperCase(), to.toUpperCase(), rate, rateDate],
          )
          .catch(() => undefined);
      }

      return rate;
    }
  } catch {
    // network error — fall through
  }

  throw new Error(`Exchange rate not available for ${from}→${to} on ${rateDate}`);
}

export async function convertAmount(
  amount: number,
  from: string,
  to: string,
  date: string,
  pgPool: Pool,
): Promise<number> {
  const rate = await getExchangeRate(from, to, date, pgPool);
  return parseFloat((amount * rate).toFixed(2));
}

// ─────────────────────────────────────────────────────────────
// Formatting
// ─────────────────────────────────────────────────────────────

export function formatCurrency(amount: number, currency: string): string {
  const code = currency.toUpperCase();

  if (code === 'INR') {
    // Indian numbering system: ₹1,23,456.78
    const [intPart, decPart] = amount.toFixed(2).split('.');
    const lastThree = intPart.slice(-3);
    const remaining = intPart.slice(0, -3);
    const withCommas = remaining
      ? remaining.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + lastThree
      : lastThree;
    return `₹${withCommas}.${decPart}`;
  }

  const symbols: Record<string, string> = {
    USD: '$',
    EUR: '€',
    GBP: '£',
    JPY: '¥',
    AED: 'AED ',
    SGD: 'S$',
    AUD: 'A$',
    CAD: 'C$',
  };

  const symbol = symbols[code] ?? `${code} `;
  const formatted = amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${symbol}${formatted}`;
}
