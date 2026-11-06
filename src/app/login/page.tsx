'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Button, Input } from '@/components/ui';
import Link from 'next/link';
import { Building2, Shield, CheckCircle } from 'lucide-react';

export default function LoginPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const mode = (searchParams.get('mode') as 'tenant' | 'admin') ?? 'tenant';
  const callbackUrl = searchParams.get('callbackUrl') ?? '/';
  const defaultSlug = searchParams.get('tenant') ?? '';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [tenantSlug, setTenantSlug] = useState(defaultSlug);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [currentMode, setCurrentMode] = useState(mode);
  const justRegistered = searchParams.get('registered') === '1';

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
        setError('This account has been suspended. Please contact LRBC support.');
      } else if (result?.error) {
        setError('Invalid email or password. Please try again.');
      } else {
        if (currentMode === 'admin') {
          router.push('/admin/platform');
        } else {
          router.push(`/${tenantSlug}/dashboard`);
        }
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-indigo-600 mb-4">
            <Building2 className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-2xl font-semibold text-white">LRBC ERP</h1>
          <p className="text-slate-400 text-sm mt-1">Business management platform</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-xl p-8">
          {/* Registration success banner */}
          {justRegistered && (
            <div className="flex items-start gap-3 bg-green-50 border border-green-200 rounded-lg px-4 py-3 mb-6 text-sm text-green-800">
              <CheckCircle className="w-5 h-5 text-green-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Account created!</p>
                <p className="text-green-700 text-xs mt-0.5">Your 14-day free trial has started. Sign in below to get started.</p>
              </div>
            </div>
          )}

          {/* Mode toggle */}
          <div className="flex mb-6 bg-slate-100 rounded-lg p-1">
            <button
              onClick={() => setCurrentMode('tenant')}
              className={`flex-1 py-2 text-sm font-medium rounded-md transition-all flex items-center justify-center gap-2 ${
                currentMode === 'tenant' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500'
              }`}
            >
              <Building2 className="w-4 h-4" />
              Company login
            </button>
            <button
              onClick={() => setCurrentMode('admin')}
              className={`flex-1 py-2 text-sm font-medium rounded-md transition-all flex items-center justify-center gap-2 ${
                currentMode === 'admin' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500'
              }`}
            >
              <Shield className="w-4 h-4" />
              LRBC staff
            </button>
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
            <Input
              label="Password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}

            <Button type="submit" className="w-full" loading={loading}>
              Sign in
            </Button>
          </form>
        </div>

        <p className="text-center text-sm text-slate-400 mt-4">
          Don&apos;t have an account?{' '}
          <Link href="/signup" className="text-indigo-400 hover:text-indigo-300 font-medium">
            Start free trial
          </Link>
        </p>

        <p className="text-center text-xs text-slate-500 mt-4">
          Powered by Novo Platform
        </p>
      </div>
    </div>
  );
}
