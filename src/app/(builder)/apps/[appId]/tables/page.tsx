'use client';

import * as React from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useSearchParams } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Spinner } from '@/components/ui/spinner';
import { useToast } from '@/components/ui/toast';

// ─── Types ────────────────────────────────────────────────────────────────────

interface TableRow {
  id: string;
  label: string;
  slug: string;
  icon: string;
  color: string;
  description: string;
  field_count: number;
  rank: number;
}

// ─── Slugify ──────────────────────────────────────────────────────────────────

function toApiKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60);
}

// ─── Icons ───────────────────────────────────────────────────────────────────

const ICONS = ['table', 'box', 'file', 'users', 'tag', 'star', 'home', 'cart', 'chart', 'map', 'mail', 'list'];
const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#3b82f6', '#8b5cf6', '#06b6d4', '#f97316'];

// ─── AddTableModal ────────────────────────────────────────────────────────────

interface AddTableModalProps {
  open: boolean;
  onClose: () => void;
  onAdd: (data: { name: string; apiKey: string; icon: string; color: string; description: string }) => Promise<void>;
}

function AddTableModal({ open, onClose, onAdd }: AddTableModalProps) {
  const [name, setName] = React.useState('');
  const [apiKey, setApiKey] = React.useState('');
  const [apiKeyTouched, setApiKeyTouched] = React.useState(false);
  const [description, setDescription] = React.useState('');
  const [icon, setIcon] = React.useState('table');
  const [color, setColor] = React.useState('#6366f1');
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState('');

  // State resets via key prop when modal is opened

  function handleNameChange(v: string) {
    setName(v);
    if (!apiKeyTouched) setApiKey(toApiKey(v));
  }

  async function handleAdd() {
    if (!name.trim()) { setError('Name is required'); return; }
    const key = apiKey.trim() || toApiKey(name);
    if (!/^[a-z][a-z0-9_]{0,59}$/.test(key)) { setError('API key must start with a letter and contain only lowercase letters, digits, underscores'); return; }
    setSaving(true); setError('');
    try {
      await onAdd({ name: name.trim(), apiKey: key, icon, color, description });
      onClose();
    } catch (err) {
      setError((err as Error).message ?? 'Failed to create table');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="New Table" size="md">
      <div className="space-y-4 p-1">
        <div>
          <label className="block text-xs font-medium text-[var(--color-fg-muted)] mb-1">Name *</label>
          <Input value={name} onChange={(e: { target: { value: string } }) => handleNameChange(e.target.value)} placeholder="e.g. Purchase Orders" />
        </div>
        <div>
          <label className="block text-xs font-medium text-[var(--color-fg-muted)] mb-1">API Key</label>
          <Input
            value={apiKey}
            onChange={(e: { target: { value: string } }) => { setApiKey(e.target.value); setApiKeyTouched(true); }}
            placeholder="purchase_orders"
            className="font-mono"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-[var(--color-fg-muted)] mb-1">Description</label>
          <Textarea value={description} onChange={(e: { target: { value: string } }) => setDescription(e.target.value)} rows={2} placeholder="Optional description" />
        </div>
        <div>
          <label className="block text-xs font-medium text-[var(--color-fg-muted)] mb-2">Icon</label>
          <div className="flex flex-wrap gap-2">
            {ICONS.map((ic) => (
              <button
                key={ic}
                type="button"
                onClick={() => setIcon(ic)}
                className={cn(
                  'w-8 h-8 rounded border text-sm transition-colors',
                  icon === ic
                    ? 'border-[var(--color-primary)] bg-[var(--color-primary)] bg-opacity-10'
                    : 'border-[var(--color-border)] hover:border-[var(--color-primary)]'
                )}
              >
                {ic[0].toUpperCase()}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-[var(--color-fg-muted)] mb-2">Color</label>
          <div className="flex gap-2">
            {COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                className={cn(
                  'w-6 h-6 rounded-full transition-transform',
                  color === c && 'ring-2 ring-offset-1 ring-[var(--color-fg-base)] scale-110'
                )}
                style={{ background: c }}
                aria-label={`Color ${c}`}
              />
            ))}
          </div>
        </div>
        {error && <p className="text-xs text-[var(--color-danger)]" role="alert">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose} type="button" disabled={saving}>Cancel</Button>
          <Button onClick={handleAdd} loading={saving} type="button">Create Table</Button>
        </div>
      </div>
    </Modal>
  );
}

// ─── Publish button ───────────────────────────────────────────────────────────

function PublishButton({ appId, tenant }: { appId: string; tenant: string }) {
  const toast = useToast();
  const [publishing, setPublishing] = React.useState(false);

  async function handlePublish() {
    setPublishing(true);
    try {
      const res = await fetch(`/api/builder/apps/${appId}/publish?tenant=${tenant}`, { method: 'POST' });
      const data = (await res.json()) as { ok?: boolean; migrations?: number; warnings?: string[]; error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Publish failed');
      toast.success(`Published — ${data.migrations ?? 0} migration(s) applied`);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setPublishing(false);
    }
  }

  return (
    <Button onClick={handlePublish} loading={publishing} type="button" size="sm">
      Publish App
    </Button>
  );
}

// ─── TableCard ────────────────────────────────────────────────────────────────

interface TableCardProps {
  table: TableRow;
  onClick: () => void;
  onDragStart: (id: string) => void;
  onDragOver: (id: string) => void;
  onDrop: () => void;
  isDragging: boolean;
  isOver: boolean;
}

function TableCard({ table, onClick, onDragStart, onDragOver, onDrop, isDragging, isOver }: TableCardProps) {
  return (
    <div
      draggable
      onDragStart={() => onDragStart(table.id)}
      onDragOver={(e: React.DragEvent<HTMLDivElement>) => { e.preventDefault(); onDragOver(table.id); }}
      onDrop={onDrop}
      onClick={onClick}
      className={cn(
        'group relative p-4 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-surface)] cursor-pointer',
        'hover:border-[var(--color-primary)] hover:shadow-md transition-all',
        isDragging && 'opacity-40',
        isOver && 'ring-2 ring-[var(--color-primary)]'
      )}
      data-testid="table-card"
    >
      <div className="flex items-start gap-3">
        <div
          className="w-10 h-10 rounded-[var(--radius-md)] flex items-center justify-center text-white text-sm font-bold flex-shrink-0"
          style={{ background: table.color }}
        >
          {table.icon?.[0]?.toUpperCase() ?? 'T'}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm text-[var(--color-fg-base)] truncate">{table.label}</p>
          <p className="text-xs text-[var(--color-fg-muted)] font-mono mt-0.5">{table.slug}</p>
          {table.description && (
            <p className="text-xs text-[var(--color-fg-muted)] mt-1 truncate">{table.description}</p>
          )}
        </div>
      </div>
      <div className="mt-3 flex items-center gap-3 text-xs text-[var(--color-fg-muted)]">
        <span>{table.field_count ?? 0} fields</span>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

function TablesPageInner() {
  const { appId } = useParams<{ appId: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const tenant = searchParams.get('tenant') ?? '';

  const [tables, setTables] = React.useState<TableRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [showAdd, setShowAdd] = React.useState(false);
  const [draggingId, setDraggingId] = React.useState<string | null>(null);
  const [overId, setOverId] = React.useState<string | null>(null);
  const toast = useToast();

  React.useEffect(() => {
    if (!tenant) return;
    let cancelled = false;
    fetch(`/api/builder/apps/${appId}/tables?tenant=${tenant}`)
      .then((res) => res.json() as Promise<{ tables?: TableRow[]; error?: string }>)
      .then((data) => {
        if (!cancelled) setTables(data.tables ?? []);
      })
      .catch((err: Error) => {
        if (!cancelled) toast.error(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [appId, tenant, toast]);

  async function handleAdd(data: { name: string; apiKey: string; icon: string; color: string; description: string }) {
    const res = await fetch(`/api/builder/apps/${appId}/tables?tenant=${tenant}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: data.name, apiKey: data.apiKey, icon: data.icon, color: data.color, description: data.description }),
    });
    const json = (await res.json()) as { table?: TableRow; error?: string };
    if (!res.ok) throw new Error(json.error ?? 'Create failed');
    setTables((prev: TableRow[]) => [...prev, json.table!]);
  }

  function handleDrop() {
    if (!draggingId || !overId || draggingId === overId) {
      setDraggingId(null); setOverId(null); return;
    }
    const reordered = [...tables];
    const fromIdx = reordered.findIndex((t) => t.id === draggingId);
    const toIdx = reordered.findIndex((t) => t.id === overId);
    if (fromIdx === -1 || toIdx === -1) { setDraggingId(null); setOverId(null); return; }
    const [moved] = reordered.splice(fromIdx, 1);
    reordered.splice(toIdx, 0, moved);
    setTables(reordered.map((t, i) => ({ ...t, rank: i })));
    setDraggingId(null); setOverId(null);
    // Persist rank updates in background
    reordered.forEach((t, i) => {
      fetch(`/api/builder/apps/${appId}/tables/${t.id}?tenant=${tenant}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rank: i }),
      }).catch(() => null);
    });
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-[var(--color-fg-base)]">Tables</h1>
          <p className="text-sm text-[var(--color-fg-muted)] mt-0.5">{tables.length} tables in this app</p>
        </div>
        <div className="flex items-center gap-3">
          <PublishButton appId={appId} tenant={tenant} />
          <Button onClick={() => setShowAdd(true)} type="button">+ Add Table</Button>
        </div>
      </div>

      {/* Grid */}
      {tables.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-[var(--color-fg-muted)] mb-4">No tables yet. Create your first table to get started.</p>
          <Button onClick={() => setShowAdd(true)} type="button">+ Add Table</Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {tables.map((table: TableRow) => (
            <TableCard
              key={table.id}
              table={table}
              onClick={() => router.push(`/apps/${appId}/tables/${table.id}?tenant=${tenant}`)}
              onDragStart={setDraggingId}
              onDragOver={setOverId}
              onDrop={handleDrop}
              isDragging={draggingId === table.id}
              isOver={overId === table.id && draggingId !== table.id}
            />
          ))}
        </div>
      )}

      <AddTableModal key={showAdd ? 'open' : 'closed'} open={showAdd} onClose={() => setShowAdd(false)} onAdd={handleAdd} />
    </div>
  );
}

export default function TablesPage() {
  return (
    <React.Suspense fallback={<div className="flex items-center justify-center h-64"><Spinner /></div>}>
      <TablesPageInner />
    </React.Suspense>
  );
}
