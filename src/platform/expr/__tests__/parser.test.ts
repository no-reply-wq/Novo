import { parseExpression } from '../parser';
import { ExprParseError } from '../index';

describe('parser', () => {
  it('parses number literal', () => {
    const ast = parseExpression('42');
    expect(ast.root).toMatchObject({ type: 'Literal', value: 42 });
  });

  it('parses float literal', () => {
    const ast = parseExpression('3.14');
    expect(ast.root).toMatchObject({ type: 'Literal', value: 3.14 });
  });

  it('parses string literal', () => {
    const ast = parseExpression('"hello"');
    expect(ast.root).toMatchObject({ type: 'Literal', value: 'hello' });
  });

  it('parses string with escape sequences', () => {
    const ast = parseExpression('"hello\\nworld"');
    expect(ast.root).toMatchObject({ type: 'Literal', value: 'hello\nworld' });
  });

  it('parses true / false', () => {
    expect(parseExpression('true').root).toMatchObject({ type: 'Literal', value: true });
    expect(parseExpression('FALSE').root).toMatchObject({ type: 'Literal', value: false });
  });

  it('parses null', () => {
    expect(parseExpression('null').root).toMatchObject({ type: 'Literal', value: null });
  });

  it('parses simple arithmetic', () => {
    const ast = parseExpression('1 + 2');
    expect(ast.root).toMatchObject({ type: 'BinaryOp', op: '+' });
  });

  it('parses operator precedence: * before +', () => {
    const ast = parseExpression('1 + 2 * 3');
    expect(ast.root).toMatchObject({
      type: 'BinaryOp', op: '+',
      right: { type: 'BinaryOp', op: '*' },
    });
  });

  it('parses unary minus', () => {
    const ast = parseExpression('-5');
    expect(ast.root).toMatchObject({ type: 'UnaryOp', op: '-' });
  });

  it('parses comparison operators', () => {
    for (const op of ['=', '!=', '<', '>', '<=', '>=']) {
      const ast = parseExpression(`1 ${op} 2`);
      expect(ast.root).toMatchObject({ type: 'BinaryOp', op });
    }
  });

  it('parses AND / OR (case insensitive)', () => {
    const ast = parseExpression('true AND false');
    expect(ast.root).toMatchObject({ type: 'BinaryOp', op: 'AND' });
    const ast2 = parseExpression('true or false');
    expect(ast2.root).toMatchObject({ type: 'BinaryOp', op: 'OR' });
  });

  it('parses NOT', () => {
    const ast = parseExpression('NOT true');
    expect(ast.root).toMatchObject({ type: 'UnaryOp', op: 'NOT' });
  });

  it('parses IN / NOT IN', () => {
    const ast = parseExpression('x IN [1,2,3]');
    expect(ast.root).toMatchObject({ type: 'In', negated: false });

    const ast2 = parseExpression('x NOT IN [1,2,3]');
    expect(ast2.root).toMatchObject({ type: 'In', negated: true });
  });

  it('parses array literal', () => {
    const ast = parseExpression('[1, 2, 3]');
    expect(ast.root).toMatchObject({ type: 'Array', elements: [
      { type: 'Literal', value: 1 },
      { type: 'Literal', value: 2 },
      { type: 'Literal', value: 3 },
    ]});
  });

  it('parses field ref', () => {
    const ast = parseExpression('record.field_name');
    expect(ast.root).toMatchObject({ type: 'FieldRef', parts: ['record', 'field_name'] });
  });

  it('parses nested field ref', () => {
    const ast = parseExpression('record.lines[0].qty');
    expect(ast.root).toMatchObject({ type: 'FieldRef', parts: ['record', 'lines'], index: 0 });
  });

  it('parses function call', () => {
    const ast = parseExpression('SUM(1, 2, 3)');
    expect(ast.root).toMatchObject({ type: 'FunctionCall', name: 'SUM' });
  });

  it('parses nested function calls', () => {
    const ast = parseExpression('IF(a = 1, SUM(2, 3), 0)');
    expect(ast.root).toMatchObject({ type: 'FunctionCall', name: 'IF' });
  });

  it('parses parenthesized expressions', () => {
    const ast = parseExpression('(1 + 2) * 3');
    expect(ast.root).toMatchObject({ type: 'BinaryOp', op: '*', left: { type: 'BinaryOp', op: '+' } });
  });

  it('throws on unterminated string', () => {
    expect(() => parseExpression('"hello')).toThrow(ExprParseError);
  });

  it('throws on unexpected character', () => {
    expect(() => parseExpression('@')).toThrow(ExprParseError);
  });

  it('throws when depth exceeds 50', () => {
    // Build 60 nested IF() calls
    let expr = '0';
    for (let i = 0; i < 60; i++) expr = `IF(true, ${expr}, 0)`;
    expect(() => parseExpression(expr)).toThrow(ExprParseError);
  });
});
