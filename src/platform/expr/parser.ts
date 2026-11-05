/**
 * Tokenizer + recursive-descent parser → ExprAST
 *
 * Security: pure module — no I/O, no dynamic code execution.
 */

import { ExprParseError } from './index';
import type { ASTNode, ExprAST, LiteralNode, FieldRefNode, BinaryOpNode } from './ast';

// ─── Token types ─────────────────────────────────────────────────────────────

type TokKind =
  | 'NUMBER' | 'STRING' | 'BOOL' | 'NULL'
  | 'IDENT' | 'COMMA' | 'DOT' | 'COLON'
  | 'LPAREN' | 'RPAREN' | 'LBRACKET' | 'RBRACKET'
  | 'PLUS' | 'MINUS' | 'STAR' | 'SLASH' | 'PERCENT'
  | 'EQ' | 'NEQ' | 'LT' | 'LTE' | 'GT' | 'GTE'
  | 'AND' | 'OR' | 'NOT' | 'IN'
  | 'EOF';

interface Token {
  kind: TokKind;
  value: string;
  pos: number;
}

// ─── Lexer ────────────────────────────────────────────────────────────────────

function tokenize(src: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < src.length) {
    // skip whitespace
    if (/\s/.test(src[i])) { i++; continue; }

    const pos = i;

    // number
    if (/[0-9]/.test(src[i]) || (src[i] === '.' && /[0-9]/.test(src[i+1] ?? ''))) {
      let n = '';
      while (i < src.length && /[0-9.]/.test(src[i])) n += src[i++];
      tokens.push({ kind: 'NUMBER', value: n, pos });
      continue;
    }

    // string "…"
    if (src[i] === '"') {
      i++;
      let s = '';
      while (i < src.length && src[i] !== '"') {
        if (src[i] === '\\') {
          i++;
          const esc = src[i] ?? '';
          s += esc === 'n' ? '\n' : esc === 't' ? '\t' : esc === 'r' ? '\r' : esc;
          i++;
        } else {
          s += src[i++];
        }
      }
      if (src[i] !== '"') throw new ExprParseError('Unterminated string', [{ message: 'Unterminated string', position: pos }]);
      i++; // consume closing "
      tokens.push({ kind: 'STRING', value: s, pos });
      continue;
    }

    // identifiers / keywords
    if (/[a-zA-Z_]/.test(src[i])) {
      let id = '';
      while (i < src.length && /[a-zA-Z0-9_]/.test(src[i])) id += src[i++];
      const upper = id.toUpperCase();
      if (upper === 'TRUE' || upper === 'FALSE') {
        tokens.push({ kind: 'BOOL', value: upper, pos });
      } else if (upper === 'NULL') {
        tokens.push({ kind: 'NULL', value: 'NULL', pos });
      } else if (upper === 'AND') {
        tokens.push({ kind: 'AND', value: 'AND', pos });
      } else if (upper === 'OR') {
        tokens.push({ kind: 'OR', value: 'OR', pos });
      } else if (upper === 'NOT') {
        tokens.push({ kind: 'NOT', value: 'NOT', pos });
      } else if (upper === 'IN') {
        tokens.push({ kind: 'IN', value: 'IN', pos });
      } else {
        tokens.push({ kind: 'IDENT', value: id, pos });
      }
      continue;
    }

    // two-char operators
    if (src[i] === '!' && src[i+1] === '=') { tokens.push({ kind: 'NEQ', value: '!=', pos }); i += 2; continue; }
    if (src[i] === '<' && src[i+1] === '=') { tokens.push({ kind: 'LTE', value: '<=', pos }); i += 2; continue; }
    if (src[i] === '>' && src[i+1] === '=') { tokens.push({ kind: 'GTE', value: '>=', pos }); i += 2; continue; }

    // single-char
    const ch = src[i];
    switch (ch) {
      case '=': tokens.push({ kind: 'EQ', value: '=', pos }); i++; break;
      case '<': tokens.push({ kind: 'LT', value: '<', pos }); i++; break;
      case '>': tokens.push({ kind: 'GT', value: '>', pos }); i++; break;
      case '+': tokens.push({ kind: 'PLUS', value: '+', pos }); i++; break;
      case '-': tokens.push({ kind: 'MINUS', value: '-', pos }); i++; break;
      case '*': tokens.push({ kind: 'STAR', value: '*', pos }); i++; break;
      case '/': tokens.push({ kind: 'SLASH', value: '/', pos }); i++; break;
      case '%': tokens.push({ kind: 'PERCENT', value: '%', pos }); i++; break;
      case '(': tokens.push({ kind: 'LPAREN', value: '(', pos }); i++; break;
      case ')': tokens.push({ kind: 'RPAREN', value: ')', pos }); i++; break;
      case '[': tokens.push({ kind: 'LBRACKET', value: '[', pos }); i++; break;
      case ']': tokens.push({ kind: 'RBRACKET', value: ']', pos }); i++; break;
      case ',': tokens.push({ kind: 'COMMA', value: ',', pos }); i++; break;
      case '.': tokens.push({ kind: 'DOT', value: '.', pos }); i++; break;
      default:
        throw new ExprParseError(`Unexpected character '${ch}'`, [{ message: `Unexpected character '${ch}'`, position: pos }]);
    }
  }

  tokens.push({ kind: 'EOF', value: '', pos: src.length });
  return tokens;
}

// ─── Parser ───────────────────────────────────────────────────────────────────

const MAX_DEPTH = 50;

class Parser {
  private pos = 0;
  private depth = 0;
  private maxDepthSeen = 0;

  constructor(private tokens: Token[], private src: string) {}

  private peek(): Token { return this.tokens[this.pos]; }
  private consume(): Token { return this.tokens[this.pos++]; }
  private expect(kind: TokKind): Token {
    const t = this.tokens[this.pos];
    if (t.kind !== kind) {
      throw new ExprParseError(
        `Expected ${kind} but got ${t.kind} ('${t.value}') at position ${t.pos}`,
        [{ message: `Expected ${kind}`, position: t.pos, token: t.value }],
      );
    }
    return this.tokens[this.pos++];
  }

  private enter() {
    this.depth++;
    if (this.depth > this.maxDepthSeen) this.maxDepthSeen = this.depth;
    if (this.depth > MAX_DEPTH) {
      throw new ExprParseError(`Expression too deeply nested (max depth ${MAX_DEPTH})`, [
        { message: `Expression too deeply nested (max depth ${MAX_DEPTH})` },
      ]);
    }
  }
  private leave() { this.depth--; }

  parse(): ExprAST {
    const root = this.parseOr();
    if (this.peek().kind !== 'EOF') {
      const t = this.peek();
      throw new ExprParseError(`Unexpected token '${t.value}'`, [{ message: `Unexpected token`, position: t.pos, token: t.value }]);
    }
    return { source: this.src, root, depth: this.maxDepthSeen };
  }

  // Precedence (lowest → highest):
  // OR
  // AND
  // NOT
  // comparison / IN / NOT IN
  // addition / subtraction
  // multiplication / division / modulo
  // unary minus
  // primary (literal, parens, function call, field ref, array)

  private parseOr(): ASTNode {
    this.enter();
    let left = this.parseAnd();
    while (this.peek().kind === 'OR') {
      this.consume();
      const right = this.parseAnd();
      left = { type: 'BinaryOp', op: 'OR', left, right };
    }
    this.leave();
    return left;
  }

  private parseAnd(): ASTNode {
    this.enter();
    let left = this.parseNot();
    while (this.peek().kind === 'AND') {
      this.consume();
      const right = this.parseNot();
      left = { type: 'BinaryOp', op: 'AND', left, right };
    }
    this.leave();
    return left;
  }

  private parseNot(): ASTNode {
    this.enter();
    if (this.peek().kind === 'NOT') {
      // peek ahead: NOT IN is handled at comparison level
      const saved = this.pos;
      this.consume();
      if (this.peek().kind === 'IN') {
        // shouldn't happen here (handled below), but guard
        this.pos = saved;
        this.leave();
        return this.parseComparison();
      }
      const operand = this.parseNot();
      this.leave();
      return { type: 'UnaryOp', op: 'NOT', operand };
    }
    const result = this.parseComparison();
    this.leave();
    return result;
  }

  private parseComparison(): ASTNode {
    this.enter();
    let left = this.parseAddSub();
    const k = this.peek().kind;
    if (k === 'EQ' || k === 'NEQ' || k === 'LT' || k === 'LTE' || k === 'GT' || k === 'GTE') {
      const op = this.consume().value as BinaryOpNode['op'];
      const right = this.parseAddSub();
      this.leave();
      return { type: 'BinaryOp', op, left, right };
    }
    // IN / NOT IN
    if (k === 'IN') {
      this.consume();
      const list = this.parseAddSub();
      this.leave();
      return { type: 'In', negated: false, value: left, list };
    }
    if (k === 'NOT') {
      const saved = this.pos;
      this.consume();
      if (this.peek().kind === 'IN') {
        this.consume();
        const list = this.parseAddSub();
        this.leave();
        return { type: 'In', negated: true, value: left, list };
      }
      this.pos = saved; // backtrack
    }
    this.leave();
    return left;
  }

  private parseAddSub(): ASTNode {
    this.enter();
    let left = this.parseMulDiv();
    while (this.peek().kind === 'PLUS' || this.peek().kind === 'MINUS') {
      const op = this.consume().value as '+' | '-';
      const right = this.parseMulDiv();
      left = { type: 'BinaryOp', op, left, right };
    }
    this.leave();
    return left;
  }

  private parseMulDiv(): ASTNode {
    this.enter();
    let left = this.parseUnary();
    while (['STAR','SLASH','PERCENT'].includes(this.peek().kind)) {
      const raw = this.consume().value;
      const op = raw === '*' ? '*' : raw === '/' ? '/' : '%';
      const right = this.parseUnary();
      left = { type: 'BinaryOp', op, left, right };
    }
    this.leave();
    return left;
  }

  private parseUnary(): ASTNode {
    this.enter();
    if (this.peek().kind === 'MINUS') {
      this.consume();
      const operand = this.parseUnary();
      this.leave();
      return { type: 'UnaryOp', op: '-', operand };
    }
    const result = this.parsePrimary();
    this.leave();
    return result;
  }

  private parsePrimary(): ASTNode {
    const t = this.peek();

    // Parenthesized expression
    if (t.kind === 'LPAREN') {
      this.consume();
      const inner = this.parseOr();
      this.expect('RPAREN');
      return inner;
    }

    // Array literal
    if (t.kind === 'LBRACKET') {
      return this.parseArrayLiteral();
    }

    // Literals
    if (t.kind === 'NUMBER') {
      this.consume();
      return { type: 'Literal', value: parseFloat(t.value) } as LiteralNode;
    }
    if (t.kind === 'STRING') {
      this.consume();
      return { type: 'Literal', value: t.value } as LiteralNode;
    }
    if (t.kind === 'BOOL') {
      this.consume();
      return { type: 'Literal', value: t.value === 'TRUE' } as LiteralNode;
    }
    if (t.kind === 'NULL') {
      this.consume();
      return { type: 'Literal', value: null } as LiteralNode;
    }

    // Identifier — function call or field ref
    if (t.kind === 'IDENT') {
      return this.parseIdentOrCall();
    }

    throw new ExprParseError(`Unexpected token '${t.value}'`, [{ message: `Unexpected token`, position: t.pos, token: t.value }]);
  }

  private parseArrayLiteral(): ASTNode {
    this.expect('LBRACKET');
    const elements: ASTNode[] = [];
    if (this.peek().kind !== 'RBRACKET') {
      elements.push(this.parseOr());
      while (this.peek().kind === 'COMMA') {
        this.consume();
        if (this.peek().kind === 'RBRACKET') break; // trailing comma
        elements.push(this.parseOr());
      }
    }
    this.expect('RBRACKET');
    return { type: 'Array', elements };
  }

  private parseIdentOrCall(): ASTNode {
    const name = this.consume().value; // IDENT

    // Function call: NAME(...)
    if (this.peek().kind === 'LPAREN') {
      this.consume();
      const args: ASTNode[] = [];
      if (this.peek().kind !== 'RPAREN') {
        args.push(this.parseOr());
        while (this.peek().kind === 'COMMA') {
          this.consume();
          if (this.peek().kind === 'RPAREN') break;
          args.push(this.parseOr());
        }
      }
      this.expect('RPAREN');
      return { type: 'FunctionCall', name: name.toUpperCase(), args };
    }

    // Field ref: name.part[idx].part ...
    return this.parseFieldRefFrom([name]);
  }

  private parseFieldRefFrom(parts: string[]): FieldRefNode {
    // Check for dot-chain
    if (this.peek().kind === 'DOT') {
      this.consume();
      const nextTok = this.expect('IDENT');
      parts.push(nextTok.value);
      return this.parseFieldRefFrom(parts);
    }

    // Check for index access: parts ends in some name, then [idx]
    if (this.peek().kind === 'LBRACKET') {
      this.consume();
      const idxTok = this.expect('NUMBER');
      this.expect('RBRACKET');
      const idx = parseInt(idxTok.value, 10);

      // After [idx], may chain more .part
      if (this.peek().kind === 'DOT') {
        this.consume();
        const tailName = this.expect('IDENT').value;
        const tail = this.parseFieldRefFrom([tailName]);
        return { type: 'FieldRef', parts, index: idx, tail };
      }
      return { type: 'FieldRef', parts, index: idx };
    }

    return { type: 'FieldRef', parts };
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function parseExpression(source: string): ExprAST {
  const tokens = tokenize(source);
  const parser = new Parser(tokens, source);
  return parser.parse();
}

// re-export for evaluator convenience
export type { ExprAST };
