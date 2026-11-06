/**
 * Structured logger for Novo.
 * In production, outputs JSON for log aggregators (Datadog, CloudWatch, etc.).
 * In development, outputs human-readable colored text.
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  level: LogLevel;
  msg: string;
  ts: string;
  [key: string]: unknown;
}

function formatDev(entry: LogEntry): string {
  const colors: Record<LogLevel, string> = {
    debug: '\x1b[36m', // cyan
    info: '\x1b[32m',  // green
    warn: '\x1b[33m',  // yellow
    error: '\x1b[31m', // red
  };
  const reset = '\x1b[0m';
  const { level, msg, ts, ...rest } = entry;
  const restStr = Object.keys(rest).length ? ' ' + JSON.stringify(rest) : '';
  return `${colors[level]}[${level.toUpperCase()}]${reset} ${ts.slice(11, 23)} ${msg}${restStr}`;
}

function log(level: LogLevel, msg: string, context?: Record<string, unknown>): void {
  const entry: LogEntry = {
    level,
    msg,
    ts: new Date().toISOString(),
    ...context,
  };

  const isDev = process.env.NODE_ENV === 'development';
  const output = isDev ? formatDev(entry) : JSON.stringify(entry);

  if (level === 'error') {
    console.error(output);
  } else if (level === 'warn') {
    console.warn(output);
  } else {
    console.log(output);
  }
}

export const logger = {
  debug: (msg: string, ctx?: Record<string, unknown>) => log('debug', msg, ctx),
  info: (msg: string, ctx?: Record<string, unknown>) => log('info', msg, ctx),
  warn: (msg: string, ctx?: Record<string, unknown>) => log('warn', msg, ctx),
  error: (msg: string, ctx?: Record<string, unknown>) => log('error', msg, ctx),
};

/** Use in API routes: logger.info('Request', { method, url, tenantSlug }) */
export default logger;
