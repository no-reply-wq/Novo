'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Sparkles, Loader2, CheckCircle2, Table2, LayoutDashboard, GitBranch } from 'lucide-react';
import type { GeneratedAppDraft } from '@/platform/ai/types';

const EXAMPLE_PROMPTS = [
  'Inventory system with suppliers, purchase orders, and stock tracking',
  'CRM for sales team with leads, contacts, and deals pipeline',
  'School management with students, classes, attendance, and grades',
  'HR leave management with employees, leave requests, and approvals',
];

export default function AiGeneratePage() {
  const router = useRouter();
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState<GeneratedAppDraft | null>(null);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleGenerate() {
    if (!description.trim() || loading) return;
    setLoading(true);
    setError(null);
    setDraft(null);

    try {
      const res = await fetch('/api/builder/ai/generate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ description: description.trim(), tenant: getTenantSlug() }),
      });

      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }

      const data = (await res.json()) as { draft: GeneratedAppDraft };
      setDraft(data.draft);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate app');
    } finally {
      setLoading(false);
    }
  }

  async function handleApply() {
    if (!draft || applying) return;
    setApplying(true);
    setError(null);

    try {
      const res = await fetch(
        `/api/builder/ai/drafts/${draft.id}/apply?tenant=${getTenantSlug()}`,
        { method: 'POST' }
      );

      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }

      const data = (await res.json()) as { appId: string };
      router.push(`/builder/apps/${data.appId}/tables`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create app');
      setApplying(false);
    }
  }

  function getTenantSlug(): string {
    // Read tenant from meta tag injected by layout or fallback to window
    if (typeof window !== 'undefined') {
      const meta = document.querySelector<HTMLMetaElement>('meta[name="tenant-slug"]');
      if (meta?.content) return meta.content;
    }
    return '';
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-10 space-y-8">
      {/* Header */}
      <div className="text-center space-y-2">
        <div className="flex items-center justify-center gap-2 text-[var(--color-primary)]">
          <Sparkles className="w-7 h-7" />
          <h1 className="text-2xl font-bold text-[var(--color-fg-base)]">AI App Generator</h1>
        </div>
        <p className="text-sm text-[var(--color-fg-muted)]">
          Describe your app in plain English — AI will design the tables, pages, and workflows.
        </p>
      </div>

      {/* Input area */}
      <div className="space-y-3">
        <textarea
          className="w-full h-36 px-4 py-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-surface)] text-[var(--color-fg-base)] placeholder:text-[var(--color-fg-muted)] resize-none focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/40 text-sm"
          placeholder="Describe your app... e.g. 'I want an inventory management system with suppliers, purchase orders, and stock tracking'"
          value={description}
          onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setDescription(e.target.value)}
          disabled={loading}
        />

        {/* Example chips */}
        <div className="flex flex-wrap gap-2">
          {EXAMPLE_PROMPTS.map((prompt) => (
            <button
              key={prompt}
              type="button"
              onClick={() => setDescription(prompt)}
              className="px-3 py-1 rounded-full text-xs border border-[var(--color-border)] text-[var(--color-fg-muted)] hover:text-[var(--color-fg-base)] hover:border-[var(--color-primary)] hover:bg-[var(--color-primary)]/5 transition-colors"
            >
              {prompt.split(' ').slice(0, 3).join(' ')}…
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={handleGenerate}
          disabled={loading || description.trim().length < 10}
          className="w-full flex items-center justify-center gap-2 px-6 py-3 rounded-lg bg-[var(--color-primary)] text-white font-medium text-sm hover:bg-[var(--color-primary)]/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              AI is designing your app…
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4" />
              Generate App
            </>
          )}
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-900/10 dark:border-red-800 px-4 py-3 text-sm text-red-700 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Draft preview */}
      {draft && (
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-surface)] overflow-hidden">
          {/* App header */}
          <div className="px-6 py-4 border-b border-[var(--color-border)] bg-[var(--color-primary)]/5 flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center shrink-0">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
                <rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
              </svg>
            </div>
            <div>
              <h2 className="font-semibold text-[var(--color-fg-base)]">{draft.app.name}</h2>
              <p className="text-sm text-[var(--color-fg-muted)]">{draft.app.description}</p>
            </div>
            <span className="ml-auto flex items-center gap-1 text-xs text-green-600 dark:text-green-400 font-medium">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Ready to create
            </span>
          </div>

          <div className="px-6 py-4 space-y-5">
            {/* Tables */}
            <section>
              <div className="flex items-center gap-2 mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--color-fg-muted)]">
                <Table2 className="w-3.5 h-3.5" />
                Tables ({draft.tables.length})
              </div>
              <ul className="space-y-1">
                {draft.tables.map((t) => (
                  <li key={t.slug} className="flex items-center justify-between text-sm">
                    <span className="font-medium text-[var(--color-fg-base)]">{t.name}</span>
                    <span className="text-[var(--color-fg-muted)]">
                      {t.fields.length} field{t.fields.length !== 1 ? 's' : ''}
                      {t.hasStock ? ' · Stock' : ''}
                      {t.hasFulfilment ? ' · Fulfilment' : ''}
                    </span>
                  </li>
                ))}
              </ul>
            </section>

            {/* Pages */}
            {draft.pages.length > 0 && (
              <section>
                <div className="flex items-center gap-2 mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--color-fg-muted)]">
                  <LayoutDashboard className="w-3.5 h-3.5" />
                  Pages ({draft.pages.length})
                </div>
                <ul className="space-y-1">
                  {draft.pages.map((p) => (
                    <li key={p.slug} className="flex items-center justify-between text-sm">
                      <span className="font-medium text-[var(--color-fg-base)]">{p.name}</span>
                      <span className="text-[var(--color-fg-muted)]">
                        {p.components.length} component{p.components.length !== 1 ? 's' : ''}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* Workflows */}
            {draft.workflows.length > 0 && (
              <section>
                <div className="flex items-center gap-2 mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--color-fg-muted)]">
                  <GitBranch className="w-3.5 h-3.5" />
                  Workflows ({draft.workflows.length})
                </div>
                <ul className="space-y-1">
                  {draft.workflows.map((w, i) => (
                    <li key={i} className="text-sm">
                      <span className="font-medium text-[var(--color-fg-base)]">{w.name}</span>
                      <span className="text-[var(--color-fg-muted)]"> — {w.trigger}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>

          {/* Actions */}
          <div className="px-6 py-4 border-t border-[var(--color-border)] flex gap-3 justify-end">
            <button
              type="button"
              onClick={() => setDraft(null)}
              className="px-4 py-2 rounded-lg text-sm text-[var(--color-fg-muted)] hover:text-[var(--color-fg-base)] hover:bg-[var(--color-bg-muted)] transition-colors"
            >
              Regenerate
            </button>
            <button
              type="button"
              onClick={handleApply}
              disabled={applying}
              className="flex items-center gap-2 px-5 py-2 rounded-lg bg-[var(--color-primary)] text-white font-medium text-sm hover:bg-[var(--color-primary)]/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {applying ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Creating App…
                </>
              ) : (
                'Create App'
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
