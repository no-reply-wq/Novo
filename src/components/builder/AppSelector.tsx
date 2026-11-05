'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Box, ChevronRight, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
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
  if (days < 30) return `${days} days ago`;
  return d.toLocaleDateString();
}

interface NewAppFormState {
  name: string;
  description: string;
}

export function AppSelector({ tenantSlug }: AppSelectorProps) {
  const router = useRouter();
  const [apps, setApps] = useState<BuilderApp[]>([]);
  // Start in loading=true only when we have a tenantSlug to fetch
  const [loading, setLoading] = useState(!!tenantSlug);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [form, setForm] = useState<NewAppFormState>({ name: '', description: '' });

  useEffect(() => {
    if (!tenantSlug) return;
    // loading starts true (see useState initialiser)
    fetch(`/api/builder/apps?tenant=${encodeURIComponent(tenantSlug)}`)
      .then((r) => (r.ok ? r.json() : r.json().then((e: { error?: string }) => Promise.reject(e.error ?? 'Failed to load apps'))))
      .then((data: { apps: BuilderApp[] }) => {
        setApps(data.apps);
        setLoading(false);
      })
      .catch((err: string) => {
        setError(typeof err === 'string' ? err : 'Failed to load apps');
        setLoading(false);
      });
  }, [tenantSlug]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError(null);
    setCreating(true);
    try {
      const res = await fetch('/api/builder/apps', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenant: tenantSlug, name: form.name, description: form.description }),
      });
      const data = (await res.json()) as { app?: BuilderApp; error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Failed to create app');
      setModalOpen(false);
      setForm({ name: '', description: '' });
      if (data.app) {
        router.push(`/builder/apps/${data.app.id}/tables`);
      }
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Failed to create app');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="p-6 md:p-8 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-fg-base)]">Your Apps</h1>
          <p className="text-sm text-[var(--color-fg-muted)] mt-1">
            Select an app to open the builder, or create a new one.
          </p>
        </div>
        <Button leftIcon={<Plus className="w-4 h-4" />} onClick={() => setModalOpen(true)}>
          New App
        </Button>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-20">
          <Spinner size="lg" />
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-[var(--color-danger)]/30 bg-[var(--color-danger)]/5 p-4 text-sm text-[var(--color-danger)]">
          {error}
        </div>
      )}

      {!loading && !error && apps.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-16 h-16 rounded-2xl bg-[var(--color-bg-muted)] flex items-center justify-center mb-4">
            <Box className="w-8 h-8 text-[var(--color-fg-muted)]" />
          </div>
          <h2 className="text-lg font-semibold text-[var(--color-fg-base)] mb-2">No apps yet</h2>
          <p className="text-sm text-[var(--color-fg-muted)] mb-6">Create your first app to get started.</p>
          <Button leftIcon={<Plus className="w-4 h-4" />} onClick={() => setModalOpen(true)}>
            New App
          </Button>
        </div>
      )}

      {!loading && !error && apps.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {apps.map((app) => (
            <button
              key={app.id}
              onClick={() => router.push(`/builder/apps/${app.id}/tables`)}
              className={cn(
                'group text-left rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-surface)] p-5',
                'hover:border-[var(--color-primary)]/50 hover:shadow-sm transition-all duration-150'
              )}
            >
              <div className="flex items-start justify-between mb-3">
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold text-sm shrink-0"
                  style={{ backgroundColor: app.color ?? 'var(--color-primary)' }}
                >
                  {app.icon ?? app.name.charAt(0).toUpperCase()}
                </div>
                <ChevronRight className="w-4 h-4 text-[var(--color-fg-muted)] opacity-0 group-hover:opacity-100 transition-opacity mt-1" />
              </div>
              <h3 className="font-semibold text-[var(--color-fg-base)] text-sm mb-1 truncate">
                {app.name}
              </h3>
              {app.description && (
                <p className="text-xs text-[var(--color-fg-muted)] line-clamp-2 mb-3">
                  {app.description}
                </p>
              )}
              <div className="flex items-center gap-1 text-xs text-[var(--color-fg-muted)]">
                <Clock className="w-3 h-3 shrink-0" />
                <span>{formatRelativeDate(app.publishedAt)}</span>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* New App Modal */}
      <Modal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setCreateError(null); setForm({ name: '', description: '' }); }}
        title="New App"
        description="Create a new application in the builder."
        size="sm"
      >
        <form onSubmit={handleCreate} className="space-y-4">
          <Input
            label="App name"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="e.g. CRM, Inventory, HR"
            required
            autoFocus
          />
          <Textarea
            label="Description"
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            placeholder="What does this app do?"
            rows={3}
          />
          {createError && (
            <p className="text-xs text-[var(--color-danger)]">{createError}</p>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => { setModalOpen(false); setCreateError(null); }}
            >
              Cancel
            </Button>
            <Button type="submit" loading={creating} disabled={!form.name.trim()}>
              Create App
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
