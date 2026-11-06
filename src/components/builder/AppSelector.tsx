'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Clock, Search, ArrowUpRight, Layers } from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';
import type { BuilderApp } from '@/types/builder';

interface AppSelectorProps {
  tenantSlug: string;
  userEmail: string;
}

function formatRelativeDate(date: Date | string | undefined): string {
  if (!date) return 'Not published';
  const d = typeof date === 'string' ? new Date(date) : date;
  const diff = Date.now() - d.getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 30) return `${days}d ago`;
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

const PALETTE = [
  { bg: '#eef2ff', text: '#4f46e5', dot: '#6366f1' },
  { bg: '#f0fdf4', text: '#16a34a', dot: '#22c55e' },
  { bg: '#fefce8', text: '#ca8a04', dot: '#eab308' },
  { bg: '#fdf4ff', text: '#9333ea', dot: '#a855f7' },
  { bg: '#fff7ed', text: '#ea580c', dot: '#f97316' },
  { bg: '#eff6ff', text: '#2563eb', dot: '#3b82f6' },
  { bg: '#fdf2f8', text: '#db2777', dot: '#ec4899' },
  { bg: '#f0fdfa', text: '#0d9488', dot: '#14b8a6' },
];

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
      if (!res.ok) throw new Error(data.error ?? 'Failed to create app');
      if (data.app) onCreated(data.app);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="px-6 py-5 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">New app</h2>
          <p className="text-sm text-gray-500 mt-0.5">Give your app a name to get started</p>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">App name</label>
            <input
              autoFocus
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Sales CRM, Inventory, HR"
              className="w-full px-4 py-3 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent bg-gray-50 placeholder:text-gray-400"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Description <span className="text-gray-400 font-normal">(optional)</span></label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="What does this app do?"
              rows={3}
              className="w-full px-4 py-3 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent bg-gray-50 placeholder:text-gray-400 resize-none"
            />
          </div>
          {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 py-3 text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-xl transition">
              Cancel
            </button>
            <button type="submit" disabled={!name.trim() || creating}
              className="flex-1 py-3 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 rounded-xl transition flex items-center justify-center gap-2">
              {creating ? <Spinner size="sm" /> : null}
              {creating ? 'Creating…' : 'Create App'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── App Card ─────────────────────────────────────────────────────────────────

function AppCard({ app, idx, onClick }: { app: BuilderApp; idx: number; onClick: () => void }) {
  const palette = PALETTE[idx % PALETTE.length];
  const initials = getInitials(app.name);

  return (
    <button onClick={onClick}
      className="group text-left bg-white border border-gray-100 rounded-2xl p-5 hover:border-gray-200 hover:shadow-md transition-all duration-200 flex flex-col gap-4">
      <div className="flex items-start justify-between">
        <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-sm font-bold"
          style={{ backgroundColor: palette.bg, color: palette.text }}>
          {initials}
        </div>
        <span className="opacity-0 group-hover:opacity-100 transition-opacity mt-1">
          <ArrowUpRight className="w-4 h-4 text-gray-400" />
        </span>
      </div>
      <div className="flex-1 min-w-0">
        <h3 className="font-semibold text-gray-900 text-sm truncate">{app.name}</h3>
        {app.description && (
          <p className="text-xs text-gray-500 mt-1 line-clamp-2 leading-relaxed">{app.description}</p>
        )}
      </div>
      <div className="flex items-center gap-1.5">
        <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: palette.dot }} />
        <span className="text-xs text-gray-400">{formatRelativeDate(app.publishedAt)}</span>
      </div>
    </button>
  );
}

// ─── Empty State ──────────────────────────────────────────────────────────────

const TEMPLATES = [
  { emoji: '🤝', label: 'CRM', desc: 'Leads & pipeline' },
  { emoji: '📦', label: 'Inventory', desc: 'Stock tracking' },
  { emoji: '🎫', label: 'Helpdesk', desc: 'Tickets & SLA' },
  { emoji: '👥', label: 'HR Portal', desc: 'Leave & payroll' },
];

function EmptyState({ onNew, onMarketplace }: { onNew: () => void; onMarketplace: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[70vh] px-6 text-center">
      <div className="w-16 h-16 rounded-3xl bg-indigo-600 flex items-center justify-center mb-6 shadow-lg shadow-indigo-200">
        <Layers className="w-8 h-8 text-white" />
      </div>
      <h2 className="text-2xl font-bold text-gray-900 mb-2">Start building</h2>
      <p className="text-gray-500 text-sm max-w-sm mb-10 leading-relaxed">
        Create powerful business apps without code. Pick a template or start from scratch.
      </p>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 w-full max-w-xl mb-10">
        {TEMPLATES.map(t => (
          <button key={t.label} onClick={onMarketplace}
            className="group flex flex-col items-center gap-2 p-4 bg-white border border-gray-100 rounded-2xl hover:border-indigo-200 hover:shadow-sm transition-all">
            <span className="text-3xl">{t.emoji}</span>
            <div>
              <div className="text-sm font-medium text-gray-800">{t.label}</div>
              <div className="text-xs text-gray-400 mt-0.5">{t.desc}</div>
            </div>
          </button>
        ))}
      </div>

      <div className="flex items-center gap-3">
        <button onClick={onNew}
          className="flex items-center gap-2 px-6 py-3 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-sm shadow-indigo-200 transition">
          <Plus className="w-4 h-4" />
          Start from scratch
        </button>
        <button onClick={onMarketplace}
          className="flex items-center gap-2 px-6 py-3 text-sm font-semibold text-gray-600 bg-white border border-gray-200 hover:bg-gray-50 rounded-xl transition">
          Browse templates
        </button>
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export function AppSelector({ tenantSlug }: AppSelectorProps) {
  const router = useRouter();
  const [apps, setApps] = useState<BuilderApp[]>([]);
  const [loading, setLoading] = useState(!!tenantSlug);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!tenantSlug) { setLoading(false); return; }
    fetch(`/api/builder/apps?tenant=${encodeURIComponent(tenantSlug)}`)
      .then(r => r.ok ? r.json() : r.json().then((e: { error?: string }) => Promise.reject(e.error ?? 'Failed')))
      .then((data: { apps: BuilderApp[] }) => { setApps(data.apps); setLoading(false); })
      .catch((err: string) => { setError(typeof err === 'string' ? err : 'Failed to load apps'); setLoading(false); });
  }, [tenantSlug]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[70vh]">
        <Spinner size="lg" />
      </div>
    );
  }

  const filtered = apps.filter(a =>
    a.name.toLowerCase().includes(search.toLowerCase()) ||
    (a.description ?? '').toLowerCase().includes(search.toLowerCase())
  );

  if (!error && apps.length === 0) {
    return (
      <>
        <EmptyState onNew={() => setModalOpen(true)} onMarketplace={() => router.push('/builder/marketplace')} />
        {modalOpen && (
          <NewAppModal tenantSlug={tenantSlug} onClose={() => setModalOpen(false)}
            onCreated={app => router.push(`/builder/apps/${app.id}/tables`)} />
        )}
      </>
    );
  }

  return (
    <div className="p-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Your Apps</h1>
          <p className="text-sm text-gray-500 mt-0.5">{apps.length} app{apps.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            <input type="text" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search…"
              className="pl-9 pr-4 py-2.5 text-sm bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 w-44 placeholder:text-gray-400" />
          </div>
          <button onClick={() => setModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition shadow-sm">
            <Plus className="w-4 h-4" /> New App
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-6 p-4 rounded-xl bg-red-50 border border-red-100 text-sm text-red-600">{error}</div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((app, idx) => (
          <AppCard key={app.id} app={app} idx={idx}
            onClick={() => router.push(`/builder/apps/${app.id}/tables`)} />
        ))}
        <button onClick={() => setModalOpen(true)}
          className={cn(
            'flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-gray-200',
            'hover:border-indigo-300 hover:bg-indigo-50/50 transition-all min-h-[160px] text-gray-400 hover:text-indigo-500'
          )}>
          <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center">
            <Plus className="w-5 h-5" />
          </div>
          <span className="text-sm font-medium">New App</span>
        </button>
      </div>

      {modalOpen && (
        <NewAppModal tenantSlug={tenantSlug} onClose={() => setModalOpen(false)}
          onCreated={app => { setApps(p => [...p, app]); setModalOpen(false); router.push(`/builder/apps/${app.id}/tables`); }} />
      )}
    </div>
  );
}
