'use client';

import { useState } from 'react';
import { Building2, Shield, Copy, CheckCircle2 } from 'lucide-react';
import Image from 'next/image';

export default function TwoFactorSetupPage() {
  const [step, setStep] = useState<'start' | 'scan' | 'verify' | 'done'>('start');
  const [qrCodeUrl, setQrCodeUrl] = useState('');
  const [secret, setSecret] = useState('');
  const [verifyToken, setVerifyToken] = useState('');
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  async function startSetup() {
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/2fa/setup', { method: 'POST' });
      const data = await res.json() as { secret?: string; qrCodeUrl?: string; error?: string };
      if (!res.ok) { setError(data.error ?? 'Setup failed'); return; }
      setSecret(data.secret ?? '');
      setQrCodeUrl(data.qrCodeUrl ?? '');
      setStep('scan');
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/2fa/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: verifyToken.trim() }),
      });
      const data = await res.json() as { backupCodes?: string[]; error?: string };
      if (!res.ok) { setError(data.error ?? 'Verification failed'); return; }
      setBackupCodes(data.backupCodes ?? []);
      setStep('done');
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  function copySecret() {
    void navigator.clipboard.writeText(secret);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-indigo-600 mb-4">
            <Building2 className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-2xl font-semibold text-white">Two-Factor Authentication</h1>
          <p className="text-slate-400 text-sm mt-1">Secure your Novo account</p>
        </div>

        <div className="bg-slate-800 border border-slate-700 rounded-2xl p-8 shadow-xl">
          {step === 'start' && (
            <div className="text-center">
              <Shield className="w-12 h-12 text-indigo-400 mx-auto mb-4" />
              <h2 className="text-white text-lg font-medium mb-2">Enable 2FA</h2>
              <p className="text-slate-400 text-sm mb-6">
                Use an authenticator app (Google Authenticator, Authy, etc.) to generate time-based codes.
              </p>
              {error && <p className="text-red-400 text-sm mb-4">{error}</p>}
              <button
                onClick={() => void startSetup()}
                disabled={loading}
                className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-medium py-2.5 px-4 rounded-lg transition"
              >
                {loading ? 'Setting up...' : 'Get Started'}
              </button>
            </div>
          )}

          {step === 'scan' && (
            <div>
              <h2 className="text-white text-lg font-medium mb-4 text-center">Scan QR Code</h2>
              {qrCodeUrl && (
                <div className="flex justify-center mb-4">
                  <Image src={qrCodeUrl} alt="TOTP QR Code" width={180} height={180} className="rounded-lg" unoptimized />
                </div>
              )}
              <p className="text-slate-400 text-sm text-center mb-2">
                {"Can't scan? Enter the secret manually:"}
              </p>
              <div className="flex items-center gap-2 bg-slate-900 rounded-lg p-2 mb-6">
                <code className="text-indigo-300 text-xs flex-1 break-all">{secret}</code>
                <button onClick={copySecret} className="text-slate-400 hover:text-white">
                  {copied ? <CheckCircle2 className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
              <button
                onClick={() => setStep('verify')}
                className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-medium py-2.5 px-4 rounded-lg transition"
              >
                {"I've Scanned It"}
              </button>
            </div>
          )}

          {step === 'verify' && (
            <form onSubmit={(e) => void handleVerify(e)}>
              <h2 className="text-white text-lg font-medium mb-4 text-center">Verify Setup</h2>
              <p className="text-slate-400 text-sm mb-4 text-center">
                Enter the 6-digit code from your authenticator app to confirm setup.
              </p>
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={verifyToken}
                onChange={(e) => setVerifyToken(e.target.value)}
                placeholder="000000"
                className="w-full bg-slate-900 border border-slate-600 rounded-lg px-4 py-3 text-white text-center text-2xl tracking-widest placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 mb-4"
                autoFocus
              />
              {error && <p className="text-red-400 text-sm mb-4">{error}</p>}
              <button
                type="submit"
                disabled={loading || verifyToken.length !== 6}
                className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-medium py-2.5 px-4 rounded-lg transition"
              >
                {loading ? 'Verifying...' : 'Enable 2FA'}
              </button>
            </form>
          )}

          {step === 'done' && (
            <div>
              <div className="text-center mb-6">
                <CheckCircle2 className="w-12 h-12 text-green-400 mx-auto mb-3" />
                <h2 className="text-white text-lg font-medium">2FA Enabled!</h2>
                <p className="text-slate-400 text-sm mt-1">
                  Save these backup codes somewhere safe. Each can only be used once.
                </p>
              </div>
              <div className="bg-slate-900 rounded-lg p-4 grid grid-cols-2 gap-2 mb-6">
                {backupCodes.map((code) => (
                  <code key={code} className="text-indigo-300 text-sm font-mono text-center">
                    {code}
                  </code>
                ))}
              </div>
              <a
                href="/builder"
                className="block w-full bg-indigo-600 hover:bg-indigo-500 text-white font-medium py-2.5 px-4 rounded-lg transition text-center"
              >
                Continue to Dashboard
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
