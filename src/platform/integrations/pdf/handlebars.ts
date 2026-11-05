/**
 * Custom Handlebars helpers for PDF/document rendering.
 *
 * Registers: formatINR, amountInWords, formatDate
 */

import Handlebars from 'handlebars';

/** Format a number as Indian Rupees. */
Handlebars.registerHelper('formatINR', (amount: unknown) => {
  const num = typeof amount === 'number' ? amount : parseFloat(String(amount ?? 0));
  if (isNaN(num)) return '₹0.00';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
  }).format(num);
});

/** Convert a number to Indian-English words (e.g. 12345 → "Twelve Thousand Three Hundred Forty Five"). */
Handlebars.registerHelper('amountInWords', (amount: unknown) => {
  const num = typeof amount === 'number' ? amount : parseFloat(String(amount ?? 0));
  if (isNaN(num)) return 'Zero';
  return toIndianWords(Math.floor(num)) + ' Rupees Only';
});

/** Format a date value. Accepts Date, ISO string, or timestamp. */
Handlebars.registerHelper('formatDate', (date: unknown, formatStr?: string | Handlebars.HelperOptions) => {
  if (!date) return '';
  const d = date instanceof Date ? date : new Date(String(date));
  if (isNaN(d.getTime())) return '';

  // If formatStr is a Handlebars HelperOptions object (called with no format arg), use default
  if (!formatStr || typeof formatStr !== 'string') {
    return d.toLocaleDateString('en-IN', { year: 'numeric', month: 'long', day: 'numeric' });
  }

  // Simple format tokens
  const yyyy = d.getFullYear().toString();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return formatStr
    .replace('YYYY', yyyy)
    .replace('MM', mm)
    .replace('DD', dd);
});

// ─── Indian number to words ────────────────────────────────────────────────────

const ones = [
  '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
  'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
  'Seventeen', 'Eighteen', 'Nineteen',
];
const tens = [
  '', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety',
];

function belowHundred(n: number): string {
  if (n < 20) return ones[n] ?? '';
  return (tens[Math.floor(n / 10)] + (n % 10 !== 0 ? ' ' + ones[n % 10] : '')).trim();
}

function belowThousand(n: number): string {
  if (n < 100) return belowHundred(n);
  const h = Math.floor(n / 100);
  const rem = n % 100;
  return (ones[h] + ' Hundred' + (rem > 0 ? ' ' + belowHundred(rem) : '')).trim();
}

function toIndianWords(n: number): string {
  if (n === 0) return 'Zero';
  if (n < 0) return 'Minus ' + toIndianWords(-n);

  const crore = Math.floor(n / 10_000_000);
  const lakh = Math.floor((n % 10_000_000) / 100_000);
  const thousand = Math.floor((n % 100_000) / 1_000);
  const rest = n % 1_000;

  const parts: string[] = [];
  if (crore) parts.push(belowThousand(crore) + ' Crore');
  if (lakh) parts.push(belowHundred(lakh) + ' Lakh');
  if (thousand) parts.push(belowHundred(thousand) + ' Thousand');
  if (rest) parts.push(belowThousand(rest));

  return parts.join(' ').trim();
}

export { Handlebars };
