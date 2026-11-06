/**
 * Recursive-descent parser → AST for the Novo expression language.
 *
 * Security: pure module — no I/O, no dynamic code execution.
 * No eval(), Function(), new Function().
 */

import { tokenize, Token, TokenKind, TokenizeError } from './tokenizer';

// ─── AST node types ───────────────────────────────────────────────────────────

export interface LiteralNode {
  type: 'Literal';
  value: string | number | boolean | null;
}

export interface IdentifierNode {
  type: 'Identifier';
  name: string;
}

export interface MemberExpressionNode {
  type: 'MemberExpression';
  object: ASTNode;
  property: string;
}

export interface CallExpressionNode {
  type: 'CallExpression';
  callee: string;
  args: ASTNode[];
}

export interface BinaryExpressionNode {
  type: 'BinaryExpression';
  op: '+' | '-' | '*' | '/' | '%' | '==' | '!=' | '<' | '<=' | '>' | '>=';
  left: ASTNode;
  right: ASTNode;
}

export interface LogicalExpressionNode {
  type: 'LogicalExpression';
  op: '&&' | '||';
  left: ASTNode;
  right: ASTNode;
}

export interface UnaryExpressionNode {
  type: 'UnaryExpression';
  op: '!' | '-';
  operand: ASTNode;
}

export interface ConditionalExpressionNode {
  type: 'ConditionalExpression';
  test: ASTNode;
  consequent: ASTNode;
  alternate: ASTNode;
}

export interface ArrayExpressionNode {
  type: 'ArrayExpression';
  elements: ASTNode[];
}

export type ASTNode =
  | LiteralNode
  | IdentifierNode
  | MemberExpressionNode
  | CallExpressionNode
  | BinaryExpressionNode
  | LogicalExpressionNode
  | UnaryExpressionNode
  | ConditionalExpressionNode
  | ArrayExpressionNode;

// ─── Parse error ──────────────────────────────────────────────────────────────

export class ParseError extends Error {
  constructor(message: string, public readonly pos: number) {
    super(message);
    this.name = 'ParseError';
  }
}

// ─── Parser ───────────────────────────────────────────────────────────────────

const MAX_DEPTH = 50;

class Parser {
  private tokens: Token[];
  private pos = 0;

  constructor(src: string) {
    try {
      this.tokens = tokenize(src);
    } catch (e) {
      if (e instanceof TokenizeError) {
        throw new ParseError(e.message, e.pos);
      }
      throw e;
    }
  }

  private peek(): Token {
    return this.tokens[this.pos] ?? { kind: 'EOF', value: '', pos: -1 };
  }

  private advance(): Token {
    const t = this.tokens[this.pos];
    if (t && t.kind !== 'EOF') this.pos++;
    return t ?? { kind: 'EOF', value: '', pos: -1 };
  }

  private expect(kind: TokenKind): Token {
    const t = this.peek();
    if (t.kind !== kind) {
      throw new ParseError(`Expected ${kind} but got ${t.kind} ('${t.value}')`, t.pos);
    }
    return this.advance();
  }

  private check(kind: TokenKind): boolean {
    return this.peek().kind === kind;
  }

  private match(...kinds: TokenKind[]): Token | null {
    for (const kind of kinds) {
      if (this.check(kind)) return this.advance();
    }
    return null;
  }

  parse(): ASTNode {
    const node = this.parseConditional(0);
    if (!this.check('EOF')) {
      const t = this.peek();
      throw new ParseError(`Unexpected token: ${t.value}`, t.pos);
    }
    return node;
  }

  private parseConditional(depth: number): ASTNode {
    if (depth > MAX_DEPTH) throw new ParseError('Expression too deeply nested', this.peek().pos);
    const test = this.parseOr(depth + 1);
    if (this.match('QUESTION')) {
      const consequent = this.parseConditional(depth + 1);
      this.expect('COLON');
      const alternate = this.parseConditional(depth + 1);
      return { type: 'ConditionalExpression', test, consequent, alternate };
    }
    return test;
  }

  private parseOr(depth: number): ASTNode {
    let left = this.parseAnd(depth + 1);
    while (this.check('OR')) {
      this.advance();
      const right = this.parseAnd(depth + 1);
      left = { type: 'LogicalExpression', op: '||', left, right };
    }
    return left;
  }

  private parseAnd(depth: number): ASTNode {
    let left = this.parseEquality(depth + 1);
    while (this.check('AND')) {
      this.advance();
      const right = this.parseEquality(depth + 1);
      left = { type: 'LogicalExpression', op: '&&', left, right };
    }
    return left;
  }

  private parseEquality(depth: number): ASTNode {
    let left = this.parseComparison(depth + 1);
    for (;;) {
      const t = this.peek();
      if (t.kind === 'EQ' || t.kind === 'NEQ') {
        this.advance();
        const op = (t.kind === 'EQ' ? '==' : '!=') as '==' | '!=';
        const right = this.parseComparison(depth + 1);
        left = { type: 'BinaryExpression', op, left, right };
      } else {
        break;
      }
    }
    return left;
  }

  private parseComparison(depth: number): ASTNode {
    let left = this.parseAddition(depth + 1);
    for (;;) {
      const t = this.peek();
      let op: '<' | '<=' | '>' | '>=' | null = null;
      if (t.kind === 'LT')  op = '<';
      else if (t.kind === 'LTE') op = '<=';
      else if (t.kind === 'GT')  op = '>';
      else if (t.kind === 'GTE') op = '>=';
      if (!op) break;
      this.advance();
      const right = this.parseAddition(depth + 1);
      left = { type: 'BinaryExpression', op, left, right };
    }
    return left;
  }

  private parseAddition(depth: number): ASTNode {
    let left = this.parseMultiplication(depth + 1);
    for (;;) {
      const t = this.peek();
      if (t.kind === 'PLUS' || t.kind === 'MINUS') {
        this.advance();
        const op = (t.kind === 'PLUS' ? '+' : '-') as '+' | '-';
        const right = this.parseMultiplication(depth + 1);
        left = { type: 'BinaryExpression', op, left, right };
      } else {
        break;
      }
    }
    return left;
  }

  private parseMultiplication(depth: number): ASTNode {
    let left = this.parseUnary(depth + 1);
    for (;;) {
      const t = this.peek();
      let op: '*' | '/' | '%' | null = null;
      if (t.kind === 'STAR')    op = '*';
      else if (t.kind === 'SLASH')   op = '/';
      else if (t.kind === 'PERCENT') op = '%';
      if (!op) break;
      this.advance();
      const right = this.parseUnary(depth + 1);
      left = { type: 'BinaryExpression', op, left, right };
    }
    return left;
  }

  private parseUnary(depth: number): ASTNode {
    if (depth > MAX_DEPTH) throw new ParseError('Expression too deeply nested', this.peek().pos);
    const t = this.peek();
    if (t.kind === 'BANG') {
      this.advance();
      return { type: 'UnaryExpression', op: '!', operand: this.parseUnary(depth + 1) };
    }
    if (t.kind === 'MINUS') {
      this.advance();
      return { type: 'UnaryExpression', op: '-', operand: this.parseUnary(depth + 1) };
    }
    return this.parseCall(depth + 1);
  }

  private parseCall(depth: number): ASTNode {
    // A function call: IDENTIFIER ( args... )
    const t = this.peek();
    if (t.kind === 'IDENTIFIER' && this.tokens[this.pos + 1]?.kind === 'LPAREN') {
      this.advance(); // consume IDENTIFIER
      this.advance(); // consume LPAREN
      const args: ASTNode[] = [];
      if (!this.check('RPAREN')) {
        args.push(this.parseConditional(depth + 1));
        while (this.match('COMMA')) {
          if (this.check('RPAREN')) break; // trailing comma ok
          args.push(this.parseConditional(depth + 1));
        }
      }
      this.expect('RPAREN');
      return { type: 'CallExpression', callee: t.value, args };
    }
    return this.parseMember(depth + 1);
  }

  private parseMember(depth: number): ASTNode {
    let node = this.parsePrimary(depth + 1);
    while (this.check('DOT')) {
      this.advance();
      const propTok = this.expect('IDENTIFIER');
      node = { type: 'MemberExpression', object: node, property: propTok.value };
    }
    return node;
  }

  private parsePrimary(depth: number): ASTNode {
    if (depth > MAX_DEPTH) throw new ParseError('Expression too deeply nested', this.peek().pos);
    const t = this.peek();

    switch (t.kind) {
      case 'NUMBER': {
        this.advance();
        return { type: 'Literal', value: parseFloat(t.value) };
      }
      case 'STRING': {
        this.advance();
        return { type: 'Literal', value: t.value };
      }
      case 'BOOLEAN': {
        this.advance();
        return { type: 'Literal', value: t.value === 'true' };
      }
      case 'NULL': {
        this.advance();
        return { type: 'Literal', value: null };
      }
      case 'IDENTIFIER': {
        this.advance();
        return { type: 'Identifier', name: t.value };
      }
      case 'LPAREN': {
        this.advance();
        const inner = this.parseConditional(depth + 1);
        this.expect('RPAREN');
        return inner;
      }
      case 'LBRACKET': {
        this.advance();
        const elements: ASTNode[] = [];
        if (!this.check('RBRACKET')) {
          elements.push(this.parseConditional(depth + 1));
          while (this.match('COMMA')) {
            if (this.check('RBRACKET')) break;
            elements.push(this.parseConditional(depth + 1));
          }
        }
        this.expect('RBRACKET');
        return { type: 'ArrayExpression', elements };
      }
      default:
        throw new ParseError(`Unexpected token: '${t.value}' (${t.kind})`, t.pos);
    }
  }
}

export function parse(src: string): ASTNode {
  return new Parser(src).parse();
}
