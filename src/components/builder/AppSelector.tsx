'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Search, ArrowUpRight } from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';
import type { BuilderApp } from '@/types/builder';

interface AppSelectorProps {
  tenantSlug: string;
  userEmail: string;
  isPlatformAdmin?: boolean;
}

function formatRelativeDate(date: Date | string | undefined): string {
  if (!date) return 'Draft — not published';
  const d = typeof date === 'string' ? new Date(date) : date;
  const diff = Date.now() - d.getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return 'Published today';
  if (days === 1) return 'Published yesterday';
  if (days < 30) return `Published ${days}d ago`;
  return 'Published ' + d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

function getInitials(name: string) {
  return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
}

// ─── New App Modal ─────────────────────────────────────────────────────────────

function NewAppModal({ tenantSlug, onClose, onCreated }: {
  tenantSlug: string;
  onClose: () => void;
  onCreated: (app: BuilderApp) => void;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setCreating(true);
    try {
      const res = await fetch('/api/builder/apps', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenant: tenantSlug, name, description }),
      });
      const data = (await res.json()) as { app?: BuilderApp; error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Couldn’t create the app. Please try again.');
      if (data.app) onCreated(data.app);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setCreating(false);
    }
  }

  const field =
    'w-full px-3.5 py-2.5 text-sm border border-[var(--color-border)] rounded-[var(--radius-md)] bg-[var(--color-bg-base)] ' +
    'placeholder:text-[var(--color-fg-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] focus:border-transparent';

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4" onClick={onClose}>
      <div
        className="w-full sm:max-w-md bg-[var(--color-bg-surface)] rounded-t-2xl sm:rounded-[var(--radius-lg)] border border-[var(--color-border)] shadow-[var(--shadow-lg)] overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="px-6 py-5 border-b border-[var(--color-border)]">
          <h2 className="text-base font-semibold text-[var(--color-fg-base)]">New app</h2>
          <p className="text-sm text-[var(--color-fg-muted)] mt-0.5">Name it to get started — you can change this later.</p>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-[var(--color-fg-base)] mb-1.5">App name</label>
            <input autoFocus type="text" value={name} onChange={e => setName(e.target.value)}
              placeholder="e.g. Sales CRM, Inventory, HR" className={field} required />
          </div>
          <div>
            <label className="block text-sm font-medium text-[var(--color-fg-base)] mb-1.5">
              Description <span className="text-[var(--color-fg-muted)] font-normal">(optional)</span>
            </label>
            <textarea value={description} onChange={e => setDescription(e.target.value)}
              placeholder="What does this app do?" rows={3} className={cn(field, 'resize-none')} />
          </div>
          {error && (
            <p role="alert" className="text-sm text-[var(--color-danger)] bg-[color-mix(in_srgb,var(--color-danger)_7%,transparent)] border border-[color-mix(in_srgb,var(--color-danger)_30%,transparent)] px-3 py-2 rounded-[var(--radius-md)]">{error}</p>
          )}
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 py-2.5 text-sm font-medium text-[var(--color-fg-base)] bg-[var(--color-bg-muted)] hover:brightness-95 rounded-[var(--radius-md)] transition">
              Cancel
            </button>
            <button type="submit" disabled={!name.trim() || creating}
              className="flex-1 py-2.5 text-sm font-medium text-[var(--color-primary-fg)] bg-[var(--color-primary)] hover:opacity-90 disabled:opacity-40 rounded-[var(--radius-md)] transition flex items-center justify-center gap-2">
              {creating ? <Spinner size="sm" /> : null}
              {creating ? 'Creating…' : 'Create app'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── App Card ─────────────────────────────────────────────────────────────────

function AppCard({ app, onClick, showTenant }: { app: BuilderApp; onClick: () => void; showTenant?: boolean }) {
  const published = !!app.publishedAt;
  return (
    <button onClick={onClick}
      className="group text-left bg-[var(--color-bg-surface)] border border-[var(--color-border)] rounded-[var(--radius-lg)] p-5 hover:border-[var(--color-primary)] transition-colors flex flex-col gap-4 min-h-[150px]">
      <div className="flex items-start justify-between">
        <div className="w-11 h-11 rounded-[var(--radius-md)] grid place-items-center text-sm font-semibold bg-[var(--color-primary-soft)] text-[var(--color-primary)]">
          {getInitials(app.name)}
        </div>
        <ArrowUpRight className="w-4 h-4 text-[var(--color-fg-muted)] opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>
      <div className="flex-1 min-w-0">
        <h3 className="font-semibold text-[var(--color-fg-base)] text-sm truncate">{app.name}</h3>
        {showTenant && app.tenantSlug && (
          <p className="text-xs text-[var(--color-fg-muted)] mt-0.5">{app.tenantSlug}</p>
        )}
        {app.description && (
          <p className="text-xs text-[var(--color-fg-muted)] mt-1 line-clamp-2 leading-relaxed">{app.description}</p>
        )}
      </div>
      <div className="flex items-center gap-1.5">
        <span className={cn('w-1.5 h-1.5 rounded-full', published ? 'bg-[var(--color-success)]' : 'bg-[var(--color-border)]')} />
        <span className="text-xs text-[var(--color-fg-muted)]">{formatRelativeDate(app.publishedAt)}</span>
      </div>
    </button>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export function AppSelector({ tenantSlug, userEmail, isPlatformAdmin }: AppSelectorProps) {
  const router = useRouter();
  const [apps, setApps] = useState<BuilderApp[]>([]);
  const [loading, setLoading] = useState(!!tenantSlug || !!isPlatformAdmin);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => {
    const slug = isPlatformAdmin ? 'all' : tenantSlug;
    if (!slug) { setLoading(false); return; }
    fetch(`/api/builder/apps?tenant=${encodeURIComponent(slug)}`)
      .then(r => r.ok ? r.json() : r.json().then((e: { error?: string }) => Promise.reject(e.error ?? 'Failed')))
      .then((data: { apps: BuilderApp[] }) => { setApps(data.apps); setLoading(false); })
      .catch((err: string) => { setError(typeof err === 'string' ? err : 'We couldn’t load your apps.'); setLoading(false); });
  }, [tenantSlug, isPlatformAdmin]);

  const filtered = apps.filter(a =>
    a.name.toLowerCase().includes(search.toLowerCase()) ||
    (a.description ?? '').toLowerCase().includes(search.toLowerCase())
  );

  const openApp = (app: BuilderApp) =>
    router.push(`/apps/${app.id}/tables?tenant=${app.tenantSlug ?? tenantSlug}`);

  return (
    <div className="min-h-full">
      <main className="max-w-5xl mx-auto px-6 py-10">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-fg-base)]">
              {isPlatformAdmin ? 'All apps' : 'Your apps'}
            </h1>
            <p className="text-sm text-[var(--color-fg-muted)] mt-1">
              {loading ? 'Loading…' : `${apps.length} app${apps.length !== 1 ? 's' : ''}${isPlatformAdmin ? ' across all tenants' : ''}`}
            </p>
          </div>
          <div className="flex items-center gap-2.5">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-fg-muted)] pointer-events-none" />
              <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search apps"
                className="pl-9 pr-3 py-2 text-sm bg-[var(--color-bg-surface)] border border-[var(--color-border)] rounded-[var(--radius-md)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] w-44 placeholder:text-[var(--color-fg-muted)]" />
            </div>
            <button onClick={() => setModalOpen(true)}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-[var(--color-primary-fg)] bg-[var(--color-primary)] hover:opacity-90 rounded-[var(--radius-md)] transition">
              <Plus className="w-4 h-4" /> New app
            </button>
          </div>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-[150px] rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-muted)] animate-pulse" />
            ))}
          </div>
        ) : error ? (
          <div className="rounded-[var(--radius-lg)] border border-[color-mix(in_srgb,var(--color-danger)_30%,transparent)] bg-[color-mix(in_srgb,var(--color-danger)_6%,transparent)] p-6 text-center">
            <p className="text-sm text-[var(--color-danger)] font-medium">{error}</p>
            <button onClick={() => location.reload()} className="mt-3 text-sm text-[var(--color-primary)] hover:underline">Try again</button>
          </div>
        ) : apps.length === 0 ? (
          <div className="rounded-[var(--radius-lg)] border border-dashed border-[var(--color-border)] bg-[var(--color-bg-surface)] py-16 px-6 text-center">
            <h2 className="text-lg font-semibold text-[var(--color-fg-base)]">No apps yet</h2>
            <p className="text-sm text-[var(--color-fg-muted)] mt-1.5 max-w-sm mx-auto">
              An app is where your tables, pages, and workflows live. Create your first one to start building.
            </p>
            <button onClick={() => setModalOpen(true)}
              className="mt-6 inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-[var(--color-primary-fg)] bg-[var(--color-primary)] hover:opacity-90 rounded-[var(--radius-md)] transition">
              <Plus className="w-4 h-4" /> Create your first app
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map(app => (
              <AppCard key={app.id} app={app} showTenant={isPlatformAdmin} onClick={() => openApp(app)} />
            ))}
            <button onClick={() => setModalOpen(true)}
              className="flex flex-col items-center justify-center gap-2 rounded-[var(--radius-lg)] border border-dashed border-[var(--color-border)] hover:border-[var(--color-primary)] hover:bg-[var(--color-primary-soft)] transition-colors min-h-[150px] text-[var(--color-fg-muted)] hover:text-[var(--color-primary)]">
              <Plus className="w-5 h-5" />
              <span className="text-sm font-medium">New app</span>
            </button>
          </div>
        )}

        {!loading && !error && filtered.length === 0 && apps.length > 0 && (
          <p className="text-sm text-[var(--color-fg-muted)] text-center mt-6">No apps match “{search}”.</p>
        )}
      </main>

      {modalOpen && (
        <NewAppModal tenantSlug={tenantSlug} onClose={() => setModalOpen(false)}
          onCreated={app => { setApps(p => [...p, app]); setModalOpen(false); openApp(app); }} />
      )}
    </div>
  );
}
