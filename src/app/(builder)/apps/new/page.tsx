'use client';

/**
 * /apps/new — New App page
 */

import React, { useState } from 'react';
import { FolderOpen, Sparkles } from 'lucide-react';
import { useRouter } from 'next/navigation';
import type { AiGeneratorDraft, AiTableDraft, AiPageDraft, AiWorkflowDraft } from '@/platform/ai/ai-types';

type Mode = 'choose' | 'describe' | 'review';

export default function NewAppPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('choose');
  const [description, setDescription] = useState('');
  const [industry, setIndustry] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<AiGeneratorDraft | null>(null);
  const [appName, setAppName] = useState('');
  const [showRaw, setShowRaw] = useState(false);
  const [creating, setCreating] = useState(false);

  async function handleGenerate() {
    if (description.trim().length < 10) { setError('Please describe your app in at least 10 characters.'); return; }
    setError(null); setLoading(true);
    try {
      const res = await fetch('/api/builder/ai/generate-app', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: description.trim(), industry: industry.trim() || undefined }),
      });
      const data = (await res.json()) as { draft?: AiGeneratorDraft; error?: string };
      if (!res.ok || !data.draft) throw new Error(data.error ?? `HTTP ${res.status}`);
      setDraft(data.draft); setAppName(data.draft.appName); setMode('review');
    } catch (e) { setError(e instanceof Error ? e.message : 'Generation failed'); }
    finally { setLoading(false); }
  }

  async function handleCreate() {
    if (!draft) return;
    setCreating(true); setError(null);
    try {
      const res = await fetch('/api/builder/ai/apply-draft', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...draft, appName }),
      });
      const data = (await res.json()) as { appId?: string; error?: string };
      if (!res.ok || !data.appId) throw new Error(data.error ?? `HTTP ${res.status}`);
      router.push(`/apps/${data.appId}`);
    } catch (e) { setError(e instanceof Error ? e.message : 'App creation failed'); setCreating(false); }
  }

  if (mode === 'choose') {
    return (
      <div className="max-w-2xl mx-auto py-16 px-4">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Create a new app</h1>
        <p className="text-gray-500 mb-10">How do you want to get started?</p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <button onClick={() => router.push('/builder')}
            className="group flex flex-col items-start gap-3 rounded-xl border-2 border-gray-200 hover:border-indigo-400 p-6 text-left transition-colors">
            <div className="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center mb-1">
              <FolderOpen className="w-6 h-6 text-gray-600" />
            </div>
            <div>
              <p className="font-semibold text-gray-900 group-hover:text-indigo-700">Start from scratch</p>
              <p className="text-sm text-gray-500 mt-1">Create tables, pages, and workflows manually.</p>
            </div>
          </button>
          <button onClick={() => setMode('describe')}
            className="group flex flex-col items-start gap-3 rounded-xl border-2 border-gray-200 hover:border-indigo-400 p-6 text-left transition-colors">
            <div className="w-12 h-12 rounded-xl bg-indigo-50 flex items-center justify-center mb-1">
              <Sparkles className="w-6 h-6 text-indigo-600" />
            </div>
            <div>
              <p className="font-semibold text-gray-900 group-hover:text-indigo-700">Describe your app</p>
              <p className="text-sm text-gray-500 mt-1">Tell us what you need — AI will generate a draft you can review.</p>
            </div>
          </button>
        </div>
      </div>
    );
  }

  if (mode === 'describe') {
    return (
      <div className="max-w-xl mx-auto py-16 px-4">
        <button onClick={() => setMode('choose')} className="text-sm text-gray-500 hover:text-gray-700 mb-6">&larr; Back</button>
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Describe your app</h1>
        <p className="text-gray-500 mb-6">Explain what your business needs.</p>
        <label className="block text-sm font-medium text-gray-700 mb-1">App description <span className="text-red-500">*</span></label>
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={6}
          placeholder="e.g. I need a purchase order system where I can manage vendors, create POs with line items, track delivery, and handle GST invoices."
          className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-none" />
        <label className="block text-sm font-medium text-gray-700 mt-4 mb-1">Industry (optional)</label>
        <input type="text" value={industry} onChange={(e) => setIndustry(e.target.value)}
          placeholder="e.g. manufacturing, retail, healthcare"
          className="w-full rounded-lg border border-gray-300 px-4 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500" />
        {error && <p className="mt-4 text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
        <button onClick={handleGenerate} disabled={loading}
          className="mt-6 w-full inline-flex items-center justify-center rounded-lg bg-indigo-600 px-4 py-3 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors">
          {loading ? 'Generating...' : 'Generate app draft'}
        </button>
      </div>
    );
  }

  if (mode === 'review' && draft) {
    return (
      <div className="max-w-2xl mx-auto py-12 px-4">
        <button onClick={() => setMode('describe')} className="text-sm text-gray-500 hover:text-gray-700 mb-6">&larr; Back</button>
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Review your draft</h1>
        <p className="text-gray-500 mb-6">Edit the name and review before creating.</p>

        <section className="mb-6">
          <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">App name</label>
          <input type="text" value={appName} onChange={(e) => setAppName(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-4 py-2 text-base font-semibold focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500" />
          {draft.description && <p className="text-sm text-gray-500 mt-1">{draft.description}</p>}
        </section>

        <section className="mb-6">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Tables ({draft.tables.length})</h2>
          <ul className="space-y-2">
            {draft.tables.map((t: AiTableDraft) => (
              <li key={t.apiKey} className="flex items-center justify-between rounded-lg border border-gray-200 px-4 py-3">
                <div><p className="font-medium text-gray-900">{t.name}</p><p className="text-xs text-gray-500">{t.description}</p></div>
                <span className="text-xs text-gray-400 ml-4 shrink-0">{t.fields.length} fields</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="mb-6">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Pages ({draft.pages.length})</h2>
          <ul className="space-y-1">
            {draft.pages.map((p: AiPageDraft, i: number) => (
              <li key={i} className="flex items-center gap-2 text-sm text-gray-700">
                <span className="rounded bg-gray-100 px-2 py-0.5 text-xs font-mono text-gray-500">{p.type}</span>
                {p.name}
              </li>
            ))}
          </ul>
        </section>

        {draft.workflows.length > 0 && (
          <section className="mb-6">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Workflows ({draft.workflows.length})</h2>
            <ul className="space-y-1">
              {draft.workflows.map((w: AiWorkflowDraft, i: number) => (
                <li key={i} className="text-sm text-gray-700">
                  <span className="font-medium">{w.name}</span>
                  <span className="text-gray-400"> — {w.description}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {draft.warnings.length > 0 && (
          <section className="mb-6 rounded-lg bg-yellow-50 border border-yellow-200 px-4 py-3">
            <p className="text-xs font-semibold text-yellow-800 mb-1">AI notes</p>
            <ul className="list-disc list-inside space-y-0.5">
              {draft.warnings.map((w: string, i: number) => (
                <li key={i} className="text-xs text-yellow-700">{w}</li>
              ))}
            </ul>
          </section>
        )}

        <div className="mb-6">
          <button onClick={() => setShowRaw((v) => !v)} className="text-xs text-indigo-600 hover:underline">
            {showRaw ? 'Hide' : 'Show'} raw JSON (power users)
          </button>
          {showRaw && (
            <pre className="mt-2 max-h-64 overflow-auto rounded-lg bg-gray-900 p-4 text-xs text-green-300">
              {JSON.stringify(draft, null, 2)}
            </pre>
          )}
        </div>

        {error && <p className="mb-4 text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

        <button onClick={handleCreate} disabled={creating}
          className="w-full inline-flex items-center justify-center rounded-lg bg-indigo-600 px-4 py-3 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors">
          {creating ? 'Creating app...' : 'Looks good, create this app'}
        </button>
      </div>
    );
  }

  return null;
}
