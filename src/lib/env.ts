/**
 * Startup environment validation.
 * Throws immediately if any required variable is missing or empty,
 * so the process fails fast with a clear message rather than a
 * confusing runtime error deep inside a request handler.
 */

const REQUIRED: string[] = [
  'DATABASE_URL',
  'NEXTAUTH_SECRET',
  'NEXTAUTH_URL',
];

export function validateEnv(): void {
  const missing = REQUIRED.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(
      `[env] Missing required environment variables: ${missing.join(', ')}\n` +
        'Set them in .env.local or in your deployment environment.'
    );
  }
}
