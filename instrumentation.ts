/**
 * Next.js instrumentation hook — runs once at server startup in both
 * Node.js and Edge runtimes before any request is served.
 *
 * We use it to validate required environment variables so the process
 * fails immediately with a clear error instead of silently misbehaving
 * on the first request.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { validateEnv } = await import('./src/lib/env');
    validateEnv();
  }
}
