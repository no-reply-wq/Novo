/**
 * Date functions: DATE_DIFF, DATE_ADD, FORMAT_DATE, YEAR, MONTH, DAY,
 *                TODAY, NOW, WEEKDAY
 */

import { ExprEvalError } from '../index';
import type { ExprValue, ExprContext } from '../index';

function toDate(v: ExprValue, fn: string): Date {
  if (v instanceof Date) return v;
  if (typeof v === 'string') {
    const d = new Date(v);
    if (!isNaN(d.getTime())) return d;
  }
  if (typeof v === 'number') return new Date(v);
  throw new ExprEvalError(`${fn}: expected date, got ${typeof v}`, fn);
}

function formatDate(d: Date, fmt: string): string {
  // Simple format tokens: YYYY, MM, DD, HH, mm, ss
  return fmt
    .replace('YYYY', String(d.getFullYear()))
    .replace('MM', String(d.getMonth() + 1).padStart(2, '0'))
    .replace('DD', String(d.getDate()).padStart(2, '0'))
    .replace('HH', String(d.getHours()).padStart(2, '0'))
    .replace('mm', String(d.getMinutes()).padStart(2, '0'))
    .replace('ss', String(d.getSeconds()).padStart(2, '0'));
}

export function makeDateFunctions(ctx: ExprContext): Record<string, (args: ExprValue[]) => ExprValue> {
  const now = ctx.now ?? new Date();

  return {
    DATE_DIFF(args) {
      const a = toDate(args[0], 'DATE_DIFF');
      const b = toDate(args[1], 'DATE_DIFF');
      const unit = typeof args[2] === 'string' ? args[2].toLowerCase() : 'day';
      const ms = a.getTime() - b.getTime();
      switch (unit) {
        case 'year': return Math.floor(ms / (1000 * 60 * 60 * 24 * 365.25));
        case 'month': return Math.floor(ms / (1000 * 60 * 60 * 24 * 30.44));
        case 'week': return Math.floor(ms / (1000 * 60 * 60 * 24 * 7));
        case 'hour': return Math.floor(ms / (1000 * 60 * 60));
        case 'minute': return Math.floor(ms / (1000 * 60));
        case 'second': return Math.floor(ms / 1000);
        default: return Math.floor(ms / (1000 * 60 * 60 * 24)); // day
      }
    },
    DATE_ADD(args) {
      const d = toDate(args[0], 'DATE_ADD');
      const amount = typeof args[1] === 'number' ? args[1] : Number(args[1]);
      const unit = typeof args[2] === 'string' ? args[2].toLowerCase() : 'day';
      const result = new Date(d);
      switch (unit) {
        case 'year': result.setFullYear(result.getFullYear() + amount); break;
        case 'month': result.setMonth(result.getMonth() + amount); break;
        case 'week': result.setDate(result.getDate() + amount * 7); break;
        case 'hour': result.setHours(result.getHours() + amount); break;
        case 'minute': result.setMinutes(result.getMinutes() + amount); break;
        case 'second': result.setSeconds(result.getSeconds() + amount); break;
        default: result.setDate(result.getDate() + amount); break;
      }
      return result;
    },
    FORMAT_DATE(args) {
      const d = toDate(args[0], 'FORMAT_DATE');
      const fmt = typeof args[1] === 'string' ? args[1] : 'YYYY-MM-DD';
      return formatDate(d, fmt);
    },
    YEAR(args) {
      return toDate(args[0], 'YEAR').getFullYear();
    },
    MONTH(args) {
      return toDate(args[0], 'MONTH').getMonth() + 1;
    },
    DAY(args) {
      return toDate(args[0], 'DAY').getDate();
    },
    TODAY(_args) {
      const d = new Date(now);
      d.setHours(0, 0, 0, 0);
      return d;
    },
    NOW(_args) {
      return new Date(now);
    },
    WEEKDAY(args) {
      // Returns 1=Mon … 7=Sun (ISO)
      const d = toDate(args[0], 'WEEKDAY');
      const day = d.getDay(); // 0=Sun
      return day === 0 ? 7 : day;
    },
  };
}
