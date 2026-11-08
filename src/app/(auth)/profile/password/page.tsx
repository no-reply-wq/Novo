'use client';

import { useState } from 'react';
import { Building2, KeyRound, Eye, EyeOff } from 'lucide-react';

function validatePassword(pw: string): string | null {
  if (pw.length < 8) return 'At least 8 characters required';
  if (!/[A-Z]/.test(pw)) return 'Must contain at least one uppercase letter';
  if (!/\d/.test(pw)) return 'Must contain at least one number';
  return null;
}

export default function ChangePasswordPage() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const pwError = newPassword ? validatePassword(newPassword) : null;
  const matchError = confirmPassword && newPassword !== confirmPassword ? 'Passwords do not match' : null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (pwError) { setError(pwError); return; }
    if (matchError) { setError(matchError); return; }

    setLoading(true);
    try {
      const res = await fetch('/api/auth/password/change', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json() as { changed?: boolean; error?: string };
      if (!res.ok) { setError(data.error ?? 'Password change failed'); return; }
      setSuccess(true);
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-indigo-600 mb-4">
            <Building2 className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-2xl font-semibold text-white">Change Password</h1>
          <p className="text-slate-400 text-sm mt-1">Update your Novo account password</p>
        </div>

        <div className="bg-slate-800 border border-slate-700 rounded-2xl p-8 shadow-xl">
          {success ? (
            <div className="text-center">
              <KeyRound className="w-12 h-12 text-green-400 mx-auto mb-3" />
              <h2 className="text-white text-lg font-medium mb-2">Password Updated</h2>
              <p className="text-slate-400 text-sm mb-6">Your password has been changed successfully.</p>
              <a href="/builder" className="block w-full bg-indigo-600 hover:bg-indigo-500 text-white font-medium py-2.5 px-4 rounded-lg transition text-center">
                Back to Dashboard
              </a>
            </div>
          ) : (
            <form onSubmit={(e) => void handleSubmit(e)} noValidate>
              <div className="space-y-4">
                {/* Current password */}
                <div>
                  <label className="block text-slate-300 text-sm font-medium mb-1.5">Current Password</label>
                  <div className="relative">
                    <input
                      type={showCurrent ? 'text' : 'password'}
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      required
                      className="w-full bg-slate-900 border border-slate-600 rounded-lg px-4 py-2.5 pr-10 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      placeholder="Current password"
                    />
                    <button type="button" onClick={() => setShowCurrent(!showCurrent)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white">
                      {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* New password */}
                <div>
                  <label className="block text-slate-300 text-sm font-medium mb-1.5">New Password</label>
                  <div className="relative">
                    <input
                      type={showNew ? 'text' : 'password'}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      required
                      className="w-full bg-slate-900 border border-slate-600 rounded-lg px-4 py-2.5 pr-10 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      placeholder="New password"
                    />
                    <button type="button" onClick={() => setShowNew(!showNew)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white">
                      {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {newPassword && (
                    <ul className="mt-2 text-xs space-y-1">
                      <li className={newPassword.length >= 8 ? 'text-green-400' : 'text-slate-500'}>Min 8 characters</li>
                      <li className={/[A-Z]/.test(newPassword) ? 'text-green-400' : 'text-slate-500'}>One uppercase letter</li>
                      <li className={/\d/.test(newPassword) ? 'text-green-400' : 'text-slate-500'}>One number</li>
                    </ul>
                  )}
                </div>

                {/* Confirm */}
                <div>
                  <label className="block text-slate-300 text-sm font-medium mb-1.5">Confirm New Password</label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    className="w-full bg-slate-900 border border-slate-600 rounded-lg px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="Confirm new password"
                  />
                  {matchError && <p className="text-red-400 text-xs mt-1">{matchError}</p>}
                </div>
              </div>

              {error && <p className="text-red-400 text-sm mt-4">{error}</p>}

              <button
                type="submit"
                disabled={loading || !currentPassword || !newPassword || !confirmPassword}
                className="mt-6 w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-medium py-2.5 px-4 rounded-lg transition"
              >
                {loading ? 'Changing...' : 'Change Password'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
