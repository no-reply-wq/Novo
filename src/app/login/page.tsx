'use client';

import { useState, Suspense } from 'react';
import { signIn, signOut, useSession } from 'next-auth/react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Button, Input } from '@/components/ui';
import Link from 'next/link';

/** Only follow same-origin relative paths — never an absolute/protocol-relative URL. */
function safeCallbackUrl(raw: string | null): string | null {
  if (!raw) return null;
  if (!raw.startsWith('/') || raw.startsWith('//')) return null;
  return raw;
}

function LoginForm() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { data: session, status } = useSession();

  const mode = (searchParams.get('mode') as 'tenant' | 'admin') ?? 'tenant';
  const callbackUrl = safeCallbackUrl(searchParams.get('callbackUrl'));
  const defaultSlug = searchParams.get('tenant') ?? '';
  const justRegistered = searchParams.get('registered') === '1';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [tenantSlug, setTenantSlug] = useState(defaultSlug);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [currentMode, setCurrentMode] = useState(mode);
  const [switching, setSwitching] = useState(false);

  function destinationFor(kind: 'tenant' | 'admin'): string {
    if (callbackUrl) return callbackUrl;
    return kind === 'admin' ? '/admin/platform' : '/builder';
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const result = await signIn(
        currentMode === 'admin' ? 'platform-admin' : 'tenant-user',
        {
          redirect: false,
          email,
          password,
          ...(currentMode === 'tenant' ? { tenantSlug } : {}),
        }
      );

      if (result?.error === 'TENANT_SUSPENDED') {
        setError('This account has been suspended. Please contact Novo support.');
      } else if (result?.error === 'TOO_MANY_ATTEMPTS') {
        setError('Too many attempts. Wait a few minutes, then try again.');
      } else if (result?.error) {
        setError('That email and password don’t match. Check both and try again.');
      } else {
        router.push(destinationFor(currentMode));
      }
    } finally {
      setLoading(false);
    }
  }

  async function useAnotherAccount() {
    setSwitching(true);
    try {
      await signOut({ redirect: false });
      router.refresh();
    } finally {
      setSwitching(false);
    }
  }

  const signedInAs = status === 'authenticated' && session?.user ? session.user : null;

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-[380px]">
        {/* Wordmark */}
        <div className="mb-10 text-center">
          <span className="text-[26px] font-semibold tracking-tight text-[var(--color-fg-base)]">
            novo<span className="text-[var(--color-primary)]">.</span>
          </span>
          <p className="text-sm text-[var(--color-fg-muted)] mt-1">Run your business in one place</p>
        </div>

        {justRegistered && (
          <div className="mb-6 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-primary-soft)] px-4 py-3 text-sm text-[var(--color-fg-base)]">
            <span className="font-medium">Account created.</span> Your 14-day trial has started — sign in below.
          </div>
        )}

        {/* Already signed in: make the live session visible instead of pretending it isn't there. */}
        {signedInAs ? (
          <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-surface)] p-6">
            <p className="text-sm text-[var(--color-fg-muted)]">You’re already signed in as</p>
            <p className="text-base font-medium text-[var(--color-fg-base)] mt-0.5 mb-5 break-all">
              {signedInAs.email}
              {signedInAs.tenantSlug ? <span className="text-[var(--color-fg-muted)]"> · {signedInAs.tenantSlug}</span> : null}
            </p>
            <div className="space-y-2">
              <Button
                className="w-full"
                onClick={() => router.push(signedInAs.isPlatformAdmin ? '/admin/platform' : (callbackUrl ?? '/builder'))}
              >
                Continue as {signedInAs.name ?? signedInAs.email}
              </Button>
              <Button variant="secondary" className="w-full" loading={switching} onClick={useAnotherAccount}>
                Sign out and use another account
              </Button>
            </div>
          </div>
        ) : (
          <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-surface)] p-6">
            {/* Mode tabs */}
            <div className="flex gap-6 border-b border-[var(--color-border)] mb-6 -mt-1">
              {([['tenant', 'Company login'], ['admin', 'Novo staff']] as const).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => { setCurrentMode(key); setError(''); }}
                  className={
                    'pb-2.5 text-sm transition-colors border-b-2 -mb-px ' +
                    (currentMode === key
                      ? 'border-[var(--color-primary)] text-[var(--color-fg-base)] font-medium'
                      : 'border-transparent text-[var(--color-fg-muted)] hover:text-[var(--color-fg-base)]')
                  }
                >
                  {label}
                </button>
              ))}
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {currentMode === 'tenant' && (
                <Input
                  label="Company ID"
                  value={tenantSlug}
                  onChange={(e) => setTenantSlug(e.target.value.toLowerCase())}
                  placeholder="your-company"
                  required
                  hint="The subdomain assigned to your company (e.g. jeevaka)"
                />
              )}
              <Input
                label="Email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                required
                autoComplete="email"
              />
              <div>
                <Input
                  label="Password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                />
                <div className="text-right mt-1.5">
                  <Link
                    href={currentMode === 'tenant' ? `/forgot-password?tenant=${tenantSlug}` : '/forgot-password'}
                    className="text-sm text-[var(--color-fg-muted)] hover:text-[var(--color-primary)]"
                  >
                    Forgot password?
                  </Link>
                </div>
              </div>

              {error && (
                <div role="alert" className="rounded-[var(--radius-md)] border border-[color-mix(in_srgb,var(--color-danger)_35%,transparent)] bg-[color-mix(in_srgb,var(--color-danger)_7%,transparent)] px-4 py-3 text-sm text-[var(--color-danger)]">
                  {error}
                </div>
              )}

              <Button type="submit" className="w-full" loading={loading}>
                Sign in
              </Button>
            </form>
          </div>
        )}

        <p className="text-center text-sm text-[var(--color-fg-muted)] mt-6">
          New to Novo?{' '}
          <Link href="/signup" className="text-[var(--color-primary)] font-medium hover:underline">
            Start a free trial
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
