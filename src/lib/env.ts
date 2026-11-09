/**
 * Startup environment validation.
 * Throws immediately if any required variable is missing or invalid,
 * so the process fails fast with a clear message rather than a
 * confusing runtime error deep inside a request handler.
 *
 * Usage: import { getEnv } from '@/lib/env' at the top of any module
 * that needs an env var, or rely on the eager validation in production.
 */

import { z } from 'zod';

const EnvSchema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  NEXTAUTH_SECRET: z
    .string()
    .min(32, 'NEXTAUTH_SECRET must be at least 32 characters'),
  NEXTAUTH_URL: z.string().url('NEXTAUTH_URL must be a valid URL'),
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),
  // Optional — warn if absent in production
  BASE_DOMAIN: z.string().optional(),
  // Optional integrations
  OPENAI_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  AWS_REGION: z.string().optional(),
  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),
  S3_BUCKET: z.string().optional(),
  RAZORPAY_KEY_ID: z.string().optional(),
  RAZORPAY_KEY_SECRET: z.string().optional(),
});

export type Env = z.infer<typeof EnvSchema>;

let _env: Env | undefined;

export function getEnv(): Env {
  if (_env) return _env;
  const result = EnvSchema.safeParse(process.env);
  if (!result.success) {
    const errors = result.error.issues
      .map((e) => `  ${e.path.join('.')}: ${e.message}`)
      .join('\n');
    throw new Error(
      `\n\nInvalid environment variables:\n${errors}\n\nSet them in .env.local or in your deployment environment.\n`,
    );
  }
  if (
    result.data.NODE_ENV === 'production' &&
    !result.data.BASE_DOMAIN
  ) {
    console.warn('[env] BASE_DOMAIN is not set — custom domains will not work');
  }
  _env = result.data;
  return _env;
}

// Keep the old simple helper for backwards compatibility
export function validateEnv(): void {
  getEnv(); // throws if invalid
}

// Eagerly validate on import in production so we fail before serving any requests
if (process.env.NODE_ENV === 'production') {
  getEnv();
}
