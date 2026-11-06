'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Plus, Box, Clock, Search, Layers, ArrowRight, Sparkles,
  LayoutGrid, Store, Zap, Database,
} from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';
import type { BuilderApp } from '@/types/builder';

interface AppSelectorProps {
  tenantSlug: string;
  userEmail: string;
}

function formatRelativeDate(date: Date | string | undefined): string {
  if (!date) return 'Never published';
  const d = typeof date === 'string' ? new Date(date) : date;
  const now = Date.now();
  const diff = now - d.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 30) return `${days}d ago`;
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

const APP_COLORS = [
  '#6366f1', '#8b5cf6', '#06b6d4', '#10b981',
  '#f59e0b', '#ef4444', '#3b82f6', '#f97316',
];

function getAppColor(app: BuilderApp, idx: number): string {
  return app.color ?? APP_COLORS[idx % APP_COLORS.length];
}

function getInitials(name: string): string {
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div
        className="w-full max-w-md bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-gray-100 dark:border-gray-800">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-9 h-9 rounded-xl bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center">
              <Layers className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-gray-900 dark:text-white">Create new app</h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">Build something powerful</p>
            </div>
          </div>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              App name <span className="text-red-500">*</span>
            </label>
            <input
              autoFocus
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Sales CRM, Inventory, HR Portal"
              className="w-full px-3 py-2.5 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-gray-900 dark:text-white placeholder:text-gray-400 transition"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              Description <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="What does this app do?"
              rows={3}
              className="w-full px-3 py-2.5 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-gray-900 dark:text-white placeholder:text-gray-400 transition resize-none"
            />
          </div>

          {error && (
            <div className="px-3 py-2.5 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-xs text-red-600 dark:text-red-400">
              {error}
            </div>
          )}

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-xl transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!name.trim() || creating}
              className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl transition flex items-center justify-center gap-2"
            >
              {creating ? <Spinner size="sm" /> : <Plus className="w-4 h-4" />}
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
  const color = getAppColor(app, idx);
  const initials = typeof app.icon === 'string' && app.icon.length <= 2 ? app.icon : getInitials(app.name);

  return (
    <button
      onClick={onClick}
      className="group relative text-left rounded-2xl border border-gray-200 dark:border-gray-700/60 bg-white dark:bg-gray-900 p-5 hover:border-indigo-300 dark:hover:border-indigo-600 hover:shadow-lg hover:shadow-indigo-500/5 transition-all duration-200 overflow-hidden"
    >
      {/* Color accent bar */}
      <div
        className="absolute top-0 left-0 right-0 h-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
        style={{ background: `linear-gradient(90deg, ${color}, transparent)` }}
      />

      <div className="flex items-start gap-3 mb-4">
        {/* Icon */}
        <div
          className="w-11 h-11 rounded-xl flex items-center justify-center text-white font-bold text-sm shrink-0 shadow-sm"
          style={{ backgroundColor: color }}
        >
          {initials}
        </div>
        {/* Arrow */}
        <div className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity mt-1">
          <ArrowRight className="w-4 h-4 text-indigo-500" />
        </div>
      </div>

      <h3 className="font-semibold text-gray-900 dark:text-white text-sm mb-1 truncate pr-4">
        {app.name}
      </h3>
      {app.description ? (
        <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2 mb-3 leading-relaxed">
          {app.description}
        </p>
      ) : (
        <div className="mb-3" />
      )}

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs text-gray-400 dark:text-gray-500">
          <Clock className="w-3 h-3" />
          <span>{formatRelativeDate(app.publishedAt)}</span>
        </div>
        <span
          className="text-xs font-medium px-2 py-0.5 rounded-full"
          style={{ backgroundColor: `${color}18`, color }}
        >
          App
        </span>
      </div>
    </button>
  );
}

// ─── Empty State ──────────────────────────────────────────────────────────────

function EmptyState({ onNew, onMarketplace }: { onNew: () => void; onMarketplace: () => void }) {
  const quickStarts = [
    { icon: <Database className="w-5 h-5" />, label: 'CRM', color: '#6366f1', desc: 'Leads, contacts & deals' },
    { icon: <Box className="w-5 h-5" />, label: 'Inventory', color: '#10b981', desc: 'Stock & purchase orders' },
    { icon: <Zap className="w-5 h-5" />, label: 'Helpdesk', color: '#f59e0b', desc: 'Tickets & SLA tracking' },
    { icon: <LayoutGrid className="w-5 h-5" />, label: 'HR Portal', color: '#3b82f6', desc: 'Leave, attendance & payroll' },
  ];

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-4">
      {/* Hero */}
      <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center mb-6 shadow-xl shadow-indigo-500/20">
        <Layers className="w-10 h-10 text-white" />
      </div>
      <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Build your first app</h2>
      <p className="text-sm text-gray-500 dark:text-gray-400 text-center max-w-md mb-10 leading-relaxed">
        Create powerful business applications without writing code. Start from scratch or pick a ready-made template.
      </p>

      {/* Quick start templates */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 w-full max-w-2xl mb-8">
        {quickStarts.map((qs) => (
          <button
            key={qs.label}
            onClick={onMarketplace}
            className="group flex flex-col items-center gap-2.5 p-4 rounded-2xl border border-gray-200 dark:border-gray-700 hover:border-indigo-300 dark:hover:border-indigo-600 bg-white dark:bg-gray-900 hover:shadow-md transition-all duration-150"
          >
            <div
              className="w-11 h-11 rounded-xl flex items-center justify-center text-white shadow-sm"
              style={{ backgroundColor: qs.color }}
            >
              {qs.icon}
            </div>
            <div className="text-center">
              <div className="text-xs font-semibold text-gray-800 dark:text-gray-200">{qs.label}</div>
              <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{qs.desc}</div>
            </div>
          </button>
        ))}
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={onNew}
          className="flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition shadow-sm shadow-indigo-500/20"
        >
          <Plus className="w-4 h-4" />
          Start from scratch
        </button>
        <button
          onClick={onMarketplace}
          className="flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-xl transition"
        >
          <Store className="w-4 h-4" />
          Browse templates
        </button>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

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

  const filtered = apps.filter(a =>
    a.name.toLowerCase().includes(search.toLowerCase()) ||
    (a.description ?? '').toLowerCase().includes(search.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-3">
          <Spinner size="lg" />
          <p className="text-sm text-gray-400">Loading your apps…</p>
        </div>
      </div>
    );
  }

  if (!loading && !error && apps.length === 0) {
    return (
      <>
        <EmptyState
          onNew={() => setModalOpen(true)}
          onMarketplace={() => router.push('/builder/marketplace')}
        />
        {modalOpen && (
          <NewAppModal
            tenantSlug={tenantSlug}
            onClose={() => setModalOpen(false)}
            onCreated={(app) => router.push(`/builder/apps/${app.id}/tables`)}
          />
        )}
      </>
    );
  }

  return (
    <div className="p-6 md:p-8 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Sparkles className="w-5 h-5 text-indigo-500" />
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">Your Apps</h1>
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {apps.length} app{apps.length !== 1 ? 's' : ''} · Select one to open the builder
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search apps…"
              className="pl-9 pr-4 py-2 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-gray-900 dark:text-white placeholder:text-gray-400 w-48 transition"
            />
          </div>
          <button
            onClick={() => setModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition shadow-sm"
          >
            <Plus className="w-4 h-4" />
            New App
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-6 px-4 py-3 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-sm text-red-600 dark:text-red-400">
          {error}
        </div>
      )}

      {/* App Grid */}
      {filtered.length === 0 && search ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Search className="w-10 h-10 text-gray-300 dark:text-gray-600 mb-3" />
          <p className="text-gray-500 dark:text-gray-400 text-sm">No apps match &quot;{search}&quot;</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map((app, idx) => (
            <AppCard
              key={app.id}
              app={app}
              idx={idx}
              onClick={() => router.push(`/builder/apps/${app.id}/tables`)}
            />
          ))}
          {/* New app card */}
          <button
            onClick={() => setModalOpen(true)}
            className={cn(
              'group text-left rounded-2xl border-2 border-dashed border-gray-200 dark:border-gray-700',
              'hover:border-indigo-300 dark:hover:border-indigo-600 p-5 transition-all duration-200',
              'flex flex-col items-center justify-center gap-3 min-h-[160px]'
            )}
          >
            <div className="w-11 h-11 rounded-xl bg-gray-100 dark:bg-gray-800 group-hover:bg-indigo-50 dark:group-hover:bg-indigo-900/30 flex items-center justify-center transition-colors">
              <Plus className="w-5 h-5 text-gray-400 group-hover:text-indigo-500 transition-colors" />
            </div>
            <span className="text-sm font-medium text-gray-400 group-hover:text-indigo-500 transition-colors">
              New App
            </span>
          </button>
        </div>
      )}

      {modalOpen && (
        <NewAppModal
          tenantSlug={tenantSlug}
          onClose={() => setModalOpen(false)}
          onCreated={(app) => {
            setApps(prev => [...prev, app]);
            setModalOpen(false);
            router.push(`/builder/apps/${app.id}/tables`);
          }}
        />
      )}
    </div>
  );
}
