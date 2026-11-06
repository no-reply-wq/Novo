/**
 * Tokenizer for the Novo expression language.
 *
 * Security: pure module — no I/O, no dynamic code execution.
 * No eval(), Function(), new Function().
 */

export type TokenKind =
  | 'NUMBER'
  | 'STRING'
  | 'BOOLEAN'
  | 'NULL'
  | 'IDENTIFIER'
  | 'DOT'
  | 'COMMA'
  | 'COLON'
  | 'QUESTION'
  | 'LPAREN'
  | 'RPAREN'
  | 'LBRACKET'
  | 'RBRACKET'
  | 'PLUS'
  | 'MINUS'
  | 'STAR'
  | 'SLASH'
  | 'PERCENT'
  | 'EQ'       // ==
  | 'NEQ'      // !=
  | 'LT'
  | 'LTE'
  | 'GT'
  | 'GTE'
  | 'AND'      // &&
  | 'OR'       // ||
  | 'BANG'     // !
  | 'EOF';

export interface Token {
  kind: TokenKind;
  value: string;
  pos: number;
}

export class TokenizeError extends Error {
  constructor(message: string, public readonly pos: number) {
    super(message);
    this.name = 'TokenizeError';
  }
}

export function tokenize(src: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < src.length) {
    // skip whitespace
    if (/\s/.test(src[i])) { i++; continue; }

    const pos = i;
    const ch = src[i];

    // number literal
    if (/[0-9]/.test(ch) || (ch === '.' && /[0-9]/.test(src[i + 1] ?? ''))) {
      let n = '';
      while (i < src.length && /[0-9.]/.test(src[i])) n += src[i++];
      tokens.push({ kind: 'NUMBER', value: n, pos });
      continue;
    }

    // string literal — single or double quotes
    if (ch === '"' || ch === "'") {
      const quote = ch;
      i++;
      let s = '';
      while (i < src.length && src[i] !== quote) {
        if (src[i] === '\\') {
          i++;
          switch (src[i]) {
            case 'n': s += '\n'; break;
            case 't': s += '\t'; break;
            case 'r': s += '\r'; break;
            default: s += src[i] ?? '';
          }
        } else {
          s += src[i];
        }
        i++;
      }
      if (i >= src.length) throw new TokenizeError('Unterminated string literal', pos);
      i++; // consume closing quote
      tokens.push({ kind: 'STRING', value: s, pos });
      continue;
    }

    // identifiers and keywords
    if (/[a-zA-Z_]/.test(ch)) {
      let id = '';
      while (i < src.length && /[a-zA-Z0-9_]/.test(src[i])) id += src[i++];
      const upper = id.toUpperCase();
      if (upper === 'TRUE') {
        tokens.push({ kind: 'BOOLEAN', value: 'true', pos });
      } else if (upper === 'FALSE') {
        tokens.push({ kind: 'BOOLEAN', value: 'false', pos });
      } else if (upper === 'NULL') {
        tokens.push({ kind: 'NULL', value: 'null', pos });
      } else {
        tokens.push({ kind: 'IDENTIFIER', value: id, pos });
      }
      continue;
    }

    // two-char operators
    if (ch === '=' && src[i + 1] === '=') {
      tokens.push({ kind: 'EQ', value: '==', pos }); i += 2; continue;
    }
    if (ch === '!' && src[i + 1] === '=') {
      tokens.push({ kind: 'NEQ', value: '!=', pos }); i += 2; continue;
    }
    if (ch === '<' && src[i + 1] === '=') {
      tokens.push({ kind: 'LTE', value: '<=', pos }); i += 2; continue;
    }
    if (ch === '>' && src[i + 1] === '=') {
      tokens.push({ kind: 'GTE', value: '>=', pos }); i += 2; continue;
    }
    if (ch === '&' && src[i + 1] === '&') {
      tokens.push({ kind: 'AND', value: '&&', pos }); i += 2; continue;
    }
    if (ch === '|' && src[i + 1] === '|') {
      tokens.push({ kind: 'OR', value: '||', pos }); i += 2; continue;
    }

    // single-char operators and punctuation
    switch (ch) {
      case '+': tokens.push({ kind: 'PLUS',     value: '+', pos }); i++; break;
      case '-': tokens.push({ kind: 'MINUS',    value: '-', pos }); i++; break;
      case '*': tokens.push({ kind: 'STAR',     value: '*', pos }); i++; break;
      case '/': tokens.push({ kind: 'SLASH',    value: '/', pos }); i++; break;
      case '%': tokens.push({ kind: 'PERCENT',  value: '%', pos }); i++; break;
      case '<': tokens.push({ kind: 'LT',       value: '<', pos }); i++; break;
      case '>': tokens.push({ kind: 'GT',       value: '>', pos }); i++; break;
      case '!': tokens.push({ kind: 'BANG',     value: '!', pos }); i++; break;
      case '(': tokens.push({ kind: 'LPAREN',   value: '(', pos }); i++; break;
      case ')': tokens.push({ kind: 'RPAREN',   value: ')', pos }); i++; break;
      case '[': tokens.push({ kind: 'LBRACKET', value: '[', pos }); i++; break;
      case ']': tokens.push({ kind: 'RBRACKET', value: ']', pos }); i++; break;
      case ',': tokens.push({ kind: 'COMMA',    value: ',', pos }); i++; break;
      case '.': tokens.push({ kind: 'DOT',      value: '.', pos }); i++; break;
      case ':': tokens.push({ kind: 'COLON',    value: ':', pos }); i++; break;
      case '?': tokens.push({ kind: 'QUESTION', value: '?', pos }); i++; break;
      default:
        throw new TokenizeError(`Unexpected character: ${ch}`, pos);
    }
  }

  tokens.push({ kind: 'EOF', value: '', pos: src.length });
  return tokens;
}
