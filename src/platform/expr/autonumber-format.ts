/**
 * Auto-number format evaluator.
 * Evaluates format strings like "PO-{YEAR}-{LOC}-{SEQ:4}" into concrete strings.
 *
 * Supported tokens:
 *   {YEAR}      - 4-digit year
 *   {MONTH}     - 2-digit month (01-12)
 *   {DAY}       - 2-digit day (01-31)
 *   {LOC}       - location code from context.location
 *   {PREFIX}    - custom prefix from context.prefix
 *   {SEQ:N}     - zero-padded sequence number, N digits wide (default 4)
 *   {SEQ}       - same as {SEQ:4}
 */

export interface AutoNumberContext {
  now?: Date;
  location?: string;
  prefix?: string;
  seq: number;
  vars?: Record<string, string>;
}

export interface AutoNumberResult {
  value: string;
  seqWidth: number;
}

const TOKEN_RE = /\{(YEAR|MONTH|DAY|LOC|PREFIX|SEQ(?::(\d+))?|[A-Z0-9_]+)\}/g;

export function evaluateAutoNumber(format: string, ctx: AutoNumberContext): AutoNumberResult {
  const now = ctx.now ?? new Date();
  const year = String(now.getFullYear());
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  let seqWidth = 4;

  const value = format.replace(TOKEN_RE, (_match, token: string, seqWidthStr?: string) => {
    switch (token) {
      case "YEAR":   return year;
      case "MONTH":  return month;
      case "DAY":    return day;
      case "LOC":    return ctx.location ?? "";
      case "PREFIX": return ctx.prefix ?? "";
      default:
        if (token === "SEQ" || token.startsWith("SEQ:")) {
          const w = seqWidthStr ? parseInt(seqWidthStr, 10) : 4;
          seqWidth = w;
          return String(ctx.seq).padStart(w, "0");
        }
        if (ctx.vars && token in ctx.vars) return ctx.vars[token];
        return _match;
    }
  });

  return { value, seqWidth };
}
