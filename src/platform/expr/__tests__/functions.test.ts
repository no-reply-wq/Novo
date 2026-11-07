import engine from '../engine';
import type { ExprContext } from '../index';

const baseCtx: ExprContext = { now: new Date('2024-06-15T10:30:00Z') };

function ev(src: string, ctx: ExprContext = baseCtx) {
  return engine.evaluateSource(src, ctx);
}

describe('Math functions', () => {
  it('SUM flat args', () => expect(ev('SUM(1,2,3)')).toBe(6));
  it('SUM array', () => expect(ev('SUM([1,2,3])')).toBe(6));
  it('AVG', () => expect(ev('AVG(2,4,6)')).toBe(4));
  it('MIN', () => expect(ev('MIN(5,3,7)')).toBe(3));
  it('MAX', () => expect(ev('MAX(5,3,7)')).toBe(7));
  it('ROUND', () => expect(ev('ROUND(3.567, 2)')).toBeCloseTo(3.57));
  it('CEIL', () => expect(ev('CEIL(3.1)')).toBe(4));
  it('FLOOR', () => expect(ev('FLOOR(3.9)')).toBe(3));
  it('ABS negative', () => expect(ev('ABS(-7)')).toBe(7));
});

describe('Conditional functions', () => {
  it('IF true branch', () => expect(ev('IF(true, 1, 2)')).toBe(1));
  it('IF false branch', () => expect(ev('IF(false, 1, 2)')).toBe(2));
  it('IFS first match', () => expect(ev('IFS(false, 1, true, 2, true, 3)')).toBe(2));
  it('SWITCH match', () => expect(ev('SWITCH("b", "a", 1, "b", 2, "c", 3)')).toBe(2));
  it('SWITCH default', () => expect(ev('SWITCH("z", "a", 1, 99)')).toBe(99));
  it('COALESCE returns first non-null', () => expect(ev('COALESCE(null, null, 42)')).toBe(42));
  it('NULLIF equal → null', () => expect(ev('NULLIF(5, 5)')).toBeNull());
  it('NULLIF unequal → first', () => expect(ev('NULLIF(5, 6)')).toBe(5));
});

describe('Text functions', () => {
  it('CONCAT', () => expect(ev('CONCAT("a","b","c")')).toBe('abc'));
  it('TRIM', () => expect(ev('TRIM("  hi  ")')).toBe('hi'));
  it('UPPER', () => expect(ev('UPPER("hello")')).toBe('HELLO'));
  it('LOWER', () => expect(ev('LOWER("WORLD")')).toBe('world'));
  it('LEFT', () => expect(ev('LEFT("hello", 3)')).toBe('hel'));
  it('RIGHT', () => expect(ev('RIGHT("hello", 3)')).toBe('llo'));
  it('MID', () => expect(ev('MID("hello", 2, 3)')).toBe('ell'));
  it('LEN', () => expect(ev('LEN("hello")')).toBe(5));
  it('REPLACE', () => expect(ev('REPLACE("hello", "l", "r")')).toBe('herro'));
  it('CONTAINS true', () => expect(ev('CONTAINS("hello", "ell")')).toBe(true));
  it('CONTAINS false', () => expect(ev('CONTAINS("hello", "xyz")')).toBe(false));
  it('STARTS_WITH', () => expect(ev('STARTS_WITH("hello", "he")')).toBe(true));
  it('ENDS_WITH', () => expect(ev('ENDS_WITH("hello", "lo")')).toBe(true));
  it('SPLIT', () => expect(ev('SPLIT("a,b,c", ",")')).toEqual(['a','b','c']));
  it('JOIN', () => expect(ev('JOIN(["a","b","c"], "-")')).toBe('a-b-c'));
});

describe('Date functions', () => {
  it('YEAR of injected now', () => expect(ev('YEAR(NOW())')).toBe(2024));
  it('MONTH of injected now', () => expect(ev('MONTH(NOW())')).toBe(6));
  it('DAY of injected now', () => expect(ev('DAY(NOW())')).toBe(15));
  it('FORMAT_DATE', () => expect(ev('FORMAT_DATE(NOW(), "YYYY-MM-DD")')).toBe('2024-06-15'));
  it('DATE_DIFF days', () => {
    const ctx: ExprContext = { now: new Date('2024-06-15') };
    const result = ev('DATE_DIFF(NOW(), NOW())', ctx);
    expect(result).toBe(0);
  });
  it('WEEKDAY saturday=6', () => {
    // 2024-06-15 is a Saturday
    expect(ev('WEEKDAY(NOW())')).toBe(6);
  });
});

describe('Type functions', () => {
  it('TEXT converts number', () => expect(ev('TEXT(42)')).toBe('42'));
  it('TEXT with format "0000"', () => expect(ev('TEXT(7, "0000")')).toBe('0007'));
  it('NUMBER parses string', () => expect(ev('NUMBER("3.14")')).toBeCloseTo(3.14));
  it('BOOLEAN of 1', () => expect(ev('BOOLEAN(1)')).toBe(true));
  it('BOOLEAN of empty string', () => expect(ev('BOOLEAN("")')).toBe(false));
  it('IS_NULL of null', () => expect(ev('IS_NULL(null)')).toBe(true));
  it('IS_NULL of 0', () => expect(ev('IS_NULL(0)')).toBe(false));
  it('IS_BLANK of spaces', () => expect(ev('IS_BLANK("  ")')).toBe(true));
  it('TYPE_OF number', () => expect(ev('TYPE_OF(42)')).toBe('number'));
  it('TYPE_OF string', () => expect(ev('TYPE_OF("hi")')).toBe('string'));
  it('TYPE_OF null', () => expect(ev('TYPE_OF(null)')).toBe('null'));
  it('TYPE_OF array', () => expect(ev('TYPE_OF([1,2])')).toBe('array'));
});

describe('Aggregate functions', () => {
  it('COUNT non-null', () => expect(ev('COUNT([1,null,3])')).toBe(2));
  it('COUNT_DISTINCT', () => expect(ev('COUNT_DISTINCT([1,2,2,3])')).toBe(3));
  it('FLAT 1 level', () => expect(ev('FLAT([[1,2],[3]])')).toEqual([1,2,3]));
  it('UNIQUE', () => expect(ev('UNIQUE([1,2,2,3,1])')).toEqual([1,2,3]));
});

describe('Math — additional functions (MOD, POWER, SQRT)', () => {
  it('MOD(10, 3) = 1', () => expect(ev('MOD(10, 3)')).toBe(1));
  it('MOD(9, 3) = 0', () => expect(ev('MOD(9, 3)')).toBe(0));
  it('MOD by zero returns null', () => expect(ev('MOD(5, 0)')).toBeNull());
  it('POWER(2, 10) = 1024', () => expect(ev('POWER(2, 10)')).toBe(1024));
  it('POWER(3, 0) = 1', () => expect(ev('POWER(3, 0)')).toBe(1));
  it('SQRT(16) = 4', () => expect(ev('SQRT(16)')).toBe(4));
  it('SQRT(0) = 0', () => expect(ev('SQRT(0)')).toBe(0));
  it('SQRT of negative returns null', () => expect(ev('SQRT(-1)')).toBeNull());
});

describe('Indian ERP functions (FORMAT_INR, AMOUNT_IN_WORDS)', () => {
  it('FORMAT_INR zero', () => expect(ev('FORMAT_INR(0)')).toBe('₹0.00'));
  it('FORMAT_INR simple', () => expect(ev('FORMAT_INR(1000)')).toBe('₹1,000.00'));
  it('FORMAT_INR lakh', () => expect(ev('FORMAT_INR(123456.78)')).toBe('₹1,23,456.78'));
  it('FORMAT_INR crore', () => expect(ev('FORMAT_INR(10000000)')).toBe('₹1,00,00,000.00'));
  it('FORMAT_INR negative', () => expect(ev('FORMAT_INR(-500)')).toBe('-₹500.00'));
  it('FORMAT_INR null returns ₹0.00', () => expect(ev('FORMAT_INR(null)')).toBe('₹0.00'));

  it('AMOUNT_IN_WORDS zero', () => expect(ev('AMOUNT_IN_WORDS(0)')).toBe('Rupees Zero Only'));
  it('AMOUNT_IN_WORDS simple', () => expect(ev('AMOUNT_IN_WORDS(1)')).toBe('Rupees One Only'));
  it('AMOUNT_IN_WORDS with paise', () => {
    const result = ev('AMOUNT_IN_WORDS(1.5)') as string;
    expect(result).toContain('Paise');
    expect(result).toContain('Fifty');
  });
  it('AMOUNT_IN_WORDS one lakh', () => {
    const result = ev('AMOUNT_IN_WORDS(100000)') as string;
    expect(result).toContain('Lakh');
    expect(result).toContain('One');
    expect(result).toContain('Only');
  });
  it('AMOUNT_IN_WORDS one crore', () => {
    const result = ev('AMOUNT_IN_WORDS(10000000)') as string;
    expect(result).toContain('Crore');
  });
});
