import engine from '../engine';
import type { ExprContext } from '../index';

const ctx: ExprContext = {
  record: { qty: 5, unit_price: 20, status: 'Approved', name: 'widget' },
  user: { id: 'u1', email: 'test@test.com', roles: ['admin'], locations: ['loc1', 'loc2'] },
  vars: {},
  now: new Date('2024-06-15T10:00:00Z'),
};

function eval_(src: string, c: ExprContext = ctx) {
  return engine.evaluateSource(src, c);
}

describe('evaluator — arithmetic', () => {
  it('adds numbers', () => expect(eval_('2 + 3')).toBe(5));
  it('subtracts', () => expect(eval_('10 - 3')).toBe(7));
  it('multiplies', () => expect(eval_('4 * 5')).toBe(20));
  it('divides', () => expect(eval_('10 / 4')).toBe(2.5));
  it('modulo', () => expect(eval_('10 % 3')).toBe(1));
  it('divides by zero returns null', () => expect(eval_('1 / 0')).toBeNull());
  it('respects precedence', () => expect(eval_('2 + 3 * 4')).toBe(14));
  it('respects parens', () => expect(eval_('(2 + 3) * 4')).toBe(20));
  it('unary minus', () => expect(eval_('-5')).toBe(-5));
});

describe('evaluator — string concatenation', () => {
  it('concatenates strings', () => expect(eval_('"hello" + " " + "world"')).toBe('hello world'));
  it('coerces number to string when mixed', () => expect(eval_('"val:" + 42')).toBe('val:42'));
});

describe('evaluator — comparisons', () => {
  it('equals', () => expect(eval_('1 = 1')).toBe(true));
  it('not equals', () => expect(eval_('1 != 2')).toBe(true));
  it('less than', () => expect(eval_('1 < 2')).toBe(true));
  it('greater than', () => expect(eval_('2 > 1')).toBe(true));
});

describe('evaluator — logic', () => {
  it('AND short-circuits', () => expect(eval_('false AND true')).toBe(false));
  it('OR short-circuits', () => expect(eval_('true OR false')).toBe(true));
  it('NOT', () => expect(eval_('NOT true')).toBe(false));
});

describe('evaluator — field refs', () => {
  it('resolves record field', () => expect(eval_('record.qty')).toBe(5));
  it('resolves user field', () => expect(eval_('user.id')).toBe('u1'));
  it('returns null for missing field', () => expect(eval_('record.missing')).toBeNull());
  it('bare field name resolves from record', () => expect(eval_('qty')).toBe(5));
});

describe('evaluator — IN operator', () => {
  it('IN array literal', () => expect(eval_('"loc1" IN ["loc1","loc2"]')).toBe(true));
  it('NOT IN', () => expect(eval_('"loc3" NOT IN ["loc1","loc2"]')).toBe(true));
  it('user.locations field', () => {
    // user.locations is ['loc1','loc2']
    expect(eval_('"loc1" IN user.locations')).toBe(true);
    expect(eval_('"loc3" IN user.locations')).toBe(false);
  });
});

describe('evaluator — wave 1 gate expressions', () => {
  it('line_total = qty * unit_price', () => {
    expect(eval_('record.qty * record.unit_price')).toBe(100);
  });
  it('gst_amount = line_total * 0.18', () => {
    expect(eval_('record.qty * record.unit_price * 0.18')).toBeCloseTo(18);
  });
  it('lock_rule = status = "Approved"', () => {
    expect(eval_('record.status = "Approved"')).toBe(true);
  });
  it('rls_condition: location_id IN user.locations', () => {
    const c: ExprContext = {
      record: { location_id: 'loc1' },
      user: { id: 'u1', email: 'e', roles: [], locations: ['loc1', 'loc2'] },
    };
    expect(eval_('record.location_id IN user.locations', c)).toBe(true);
  });
  it('auto_number prefix with YEAR', () => {
    expect(eval_('"PO-" + YEAR(NOW())')).toBe('PO-2024');
  });
});

describe('evaluator — LOOKUP', () => {
  it('returns field values from related rows', () => {
    const c: ExprContext = {
      record: {},
      relations: {
        lines: [
          { qty: 2, price: 10 },
          { qty: 3, price: 20 },
        ],
      },
    };
    const result = engine.evaluateSource('LOOKUP("lines", null, "qty")', c);
    expect(result).toEqual([2, 3]);
  });

  it('SUM of LOOKUP result', () => {
    const c: ExprContext = {
      record: {},
      relations: {
        lines: [
          { line_total: 100 },
          { line_total: 200 },
        ],
      },
    };
    expect(engine.evaluateSource('SUM(LOOKUP("lines", null, "line_total"))', c)).toBe(300);
  });
});
