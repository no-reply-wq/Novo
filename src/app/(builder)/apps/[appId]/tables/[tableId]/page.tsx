'use client';

import * as React from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Spinner } from '@/components/ui/spinner';
import { useToast } from '@/components/ui/toast';
import { FieldList } from '@/components/builder/FieldList';
import { FieldEditor } from '@/components/builder/FieldEditor';
import { RelationManager } from '@/components/builder/RelationManager';
import type { FieldDef } from '@/platform/contracts/fields';
import type { RelationDef } from '@/platform/contracts/tables';

// ─── Types ────────────────────────────────────────────────────────────────────

interface TableMeta {
  id: string;
  label: string;
  slug: string;
  icon: string;
  color: string;
  description: string;
  soft_delete?: { enabled: boolean; requireReason: boolean; recycleBinRetentionDays?: number } | null;
  audit_config?: { enabled: boolean; versionsEnabled?: boolean } | null;
  schema_version: number;
}

type Tab = 'fields' | 'relations' | 'settings' | 'indexes';

// ─── Publish button ───────────────────────────────────────────────────────────

function PublishButton({ appId, tenant }: { appId: string; tenant: string }) {
  const toast = useToast();
  const [publishing, setPublishing] = React.useState(false);

  async function handlePublish() {
    setPublishing(true);
    try {
      const res = await fetch(`/api/builder/apps/${appId}/publish?tenant=${tenant}`, { method: 'POST' });
      const data = (await res.json()) as { ok?: boolean; migrations?: number; error?: string };
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

// ─── Settings tab ─────────────────────────────────────────────────────────────

interface SettingsTabProps {
  table: TableMeta;
  tenant: string;
  appId: string;
  onSaved: (table: TableMeta) => void;
}

function SettingsTab({ table, tenant, appId, onSaved }: SettingsTabProps) {
  const toast = useToast();
  const [softDeleteEnabled, setSoftDeleteEnabled] = React.useState(Boolean(table.soft_delete?.enabled));
  const [requireReason, setRequireReason] = React.useState(Boolean(table.soft_delete?.requireReason));
  const [auditEnabled, setAuditEnabled] = React.useState(Boolean(table.audit_config?.enabled));
  const [versionsEnabled, setVersionsEnabled] = React.useState(Boolean(table.audit_config?.versionsEnabled));
  const [saving, setSaving] = React.useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch(`/api/builder/apps/${appId}/tables/${table.id}?tenant=${tenant}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          soft_delete: { enabled: softDeleteEnabled, requireReason, recycleBinRetentionDays: 30 },
          audit_config: { enabled: auditEnabled, versionsEnabled },
        }),
      });
      const data = (await res.json()) as { table?: TableMeta; error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Save failed');
      onSaved(data.table!);
      toast.success('Settings saved');
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-lg space-y-6 py-4">
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-[var(--color-fg-base)]">Soft Delete</h3>
        <div className="flex items-center gap-3">
          <Switch checked={softDeleteEnabled} onChange={setSoftDeleteEnabled} id="soft-delete" />
          <label htmlFor="soft-delete" className="text-sm text-[var(--color-fg-base)]">Enable soft delete (move to recycle bin)</label>
        </div>
        {softDeleteEnabled && (
          <div className="ml-10 flex items-center gap-3">
            <Switch checked={requireReason} onChange={setRequireReason} id="require-reason" />
            <label htmlFor="require-reason" className="text-sm text-[var(--color-fg-muted)]">Require reason for deletion</label>
          </div>
        )}
      </div>

      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-[var(--color-fg-base)]">Audit Log</h3>
        <div className="flex items-center gap-3">
          <Switch checked={auditEnabled} onChange={setAuditEnabled} id="audit" />
          <label htmlFor="audit" className="text-sm text-[var(--color-fg-base)]">Log field-level changes</label>
        </div>
        {auditEnabled && (
          <div className="ml-10 flex items-center gap-3">
            <Switch checked={versionsEnabled} onChange={setVersionsEnabled} id="versions" />
            <label htmlFor="versions" className="text-sm text-[var(--color-fg-muted)]">Keep named record versions</label>
          </div>
        )}
      </div>

      <Button onClick={handleSave} loading={saving} type="button">Save Settings</Button>
    </div>
  );
}

// ─── Indexes tab ──────────────────────────────────────────────────────────────

function IndexesTab({ fields }: { fields: FieldDef[] }) {
  const indexed = fields.filter((f) => f.unique);
  return (
    <div className="max-w-lg py-4 space-y-4">
      <p className="text-sm text-[var(--color-fg-muted)]">
        Indexes are automatically created for unique fields. Future index management will appear here.
      </p>
      {indexed.length === 0 ? (
        <p className="text-sm text-[var(--color-fg-muted)] italic">No unique fields — no indexes yet.</p>
      ) : (
        <div className="space-y-2">
          {indexed.map((f) => (
            <div key={f.id} className="flex items-center gap-3 px-4 py-2 border border-[var(--color-border)] rounded-[var(--radius-md)] bg-[var(--color-bg-surface)] text-sm">
              <span className="font-mono text-[var(--color-fg-muted)]">{f.apiKey}</span>
              <span className="text-xs bg-[var(--color-bg-muted)] px-1.5 py-0.5 rounded">UNIQUE</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

function TableDetailPageInner() {
  const { appId, tableId } = useParams<{ appId: string; tableId: string }>();
  const searchParams = useSearchParams();
  const tenant = searchParams.get('tenant') ?? '';

  const [table, setTable] = React.useState<TableMeta | null>(null);
  const [fields, setFields] = React.useState<FieldDef[]>([]);
  const [relations, setRelations] = React.useState<RelationDef[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [activeTab, setActiveTab] = React.useState<Tab>('fields');
  const [fieldEditorOpen, setFieldEditorOpen] = React.useState(false);
  const [editingField, setEditingField] = React.useState<FieldDef | undefined>(undefined);
  const toast = useToast();

  React.useEffect(() => {
    if (!tenant) return;
    let cancelled = false;
    fetch(`/api/builder/apps/${appId}/tables/${tableId}?tenant=${tenant}`)
      .then((res) => res.json() as Promise<{ table?: TableMeta; fields?: FieldDef[]; relations?: RelationDef[]; error?: string }>)
      .then((data) => {
        if (!cancelled) {
          setTable(data.table ?? null);
          setFields((data.fields ?? []).filter((f) => !(f as unknown as { is_system?: boolean }).is_system));
          setRelations(data.relations ?? []);
        }
      })
      .catch((err: Error) => {
        if (!cancelled) toast.error(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [appId, tableId, tenant, toast]);

  async function handleSaveField(field: Omit<FieldDef, 'id' | 'tableId' | 'createdAt' | 'updatedAt'>) {
    if (editingField) {
      // Update
      const res = await fetch(
        `/api/builder/apps/${appId}/tables/${tableId}/fields/${editingField.id}?tenant=${tenant}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: field.name,
            options: field.options,
            required: field.required,
            unique: field.unique,
            defaultValue: field.defaultValue,
            lockWhen: field.lockWhen,
            hint: field.hint,
          }),
        }
      );
      const data = (await res.json()) as { field?: Record<string, unknown>; error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Update failed');
      setFields((prev: FieldDef[]) => prev.map((f: FieldDef) => (f.id === editingField.id ? mapRawField(data.field!) : f)));
      setEditingField(undefined);
    } else {
      // Create
      const res = await fetch(`/api/builder/apps/${appId}/tables/${tableId}/fields?tenant=${tenant}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: field.name,
          apiKey: field.apiKey,
          type: field.type,
          options: field.options,
          required: field.required,
          unique: field.unique,
          defaultValue: field.defaultValue,
          lockWhen: field.lockWhen,
          hint: field.hint,
        }),
      });
      const data = (await res.json()) as { field?: Record<string, unknown>; error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Create failed');
      setFields((prev: FieldDef[]) => [...prev, mapRawField(data.field!)]);
    }
  }

  function mapRawField(raw: Record<string, unknown>): FieldDef {
    return {
      id: raw.id as string,
      tableId: tableId,
      name: (raw.label ?? raw.name) as string,
      apiKey: raw.slug as string,
      type: raw.type as FieldDef['type'],
      options: raw.options as FieldDef['options'],
      required: Boolean(raw.is_required ?? raw.required),
      unique: Boolean(raw.is_unique ?? raw.unique),
      defaultValue: raw.default_value as FieldDef['defaultValue'],
      lockWhen: raw.lock_when as string | undefined,
      hint: raw.hint as string | undefined,
      rank: Number(raw.field_order ?? raw.rank ?? 0),
      createdAt: new Date(raw.created_at as string),
      updatedAt: new Date(raw.updated_at as string),
    };
  }

  async function handleDeleteField(field: FieldDef) {
    if (!confirm(`Delete field "${field.name}"? This cannot be undone.`)) return;
    try {
      const res = await fetch(
        `/api/builder/apps/${appId}/tables/${tableId}/fields/${field.id}?tenant=${tenant}`,
        { method: 'DELETE' }
      );
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? 'Delete failed');
      }
      setFields((prev: FieldDef[]) => prev.filter((f: FieldDef) => f.id !== field.id));
      toast.success(`Field "${field.name}" deleted`);
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  function handleEditField(field: FieldDef) {
    setEditingField(field);
    setFieldEditorOpen(true);
  }

  function handleReorder(reordered: FieldDef[]) {
    setFields(reordered);
    reordered.forEach((f, i) => {
      fetch(`/api/builder/apps/${appId}/tables/${tableId}/fields/${f.id}?tenant=${tenant}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rank: i }),
      }).catch(() => null);
    });
  }

  const TABS: Array<{ id: Tab; label: string }> = [
    { id: 'fields', label: 'Fields' },
    { id: 'relations', label: 'Relations' },
    { id: 'settings', label: 'Settings' },
    { id: 'indexes', label: 'Indexes' },
  ];

  if (loading || !table) {
    return (
      <div className="flex items-center justify-center h-64">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-border)] bg-[var(--color-bg-surface)]">
        <div className="flex items-center gap-3">
          <div
            className="w-9 h-9 rounded-[var(--radius-md)] flex items-center justify-center text-white text-sm font-bold"
            style={{ background: table.color }}
          >
            {table.icon?.[0]?.toUpperCase() ?? 'T'}
          </div>
          <div>
            <h1 className="font-bold text-[var(--color-fg-base)]">{table.label}</h1>
            <p className="text-xs text-[var(--color-fg-muted)] font-mono">{table.slug}</p>
          </div>
        </div>
        <PublishButton appId={appId} tenant={tenant} />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 px-6 pt-3 border-b border-[var(--color-border)]">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              'px-4 py-2 text-sm font-medium rounded-t-[var(--radius-md)] transition-colors border-b-2',
              activeTab === tab.id
                ? 'border-[var(--color-primary)] text-[var(--color-primary)]'
                : 'border-transparent text-[var(--color-fg-muted)] hover:text-[var(--color-fg-base)]'
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto p-6">
        {activeTab === 'fields' && (
          <FieldList
            fields={fields}
            onEdit={handleEditField}
            onDelete={handleDeleteField}
            onReorder={handleReorder}
            onAddField={() => { setEditingField(undefined); setFieldEditorOpen(true); }}
          />
        )}
        {activeTab === 'relations' && (
          <RelationManager
            relations={relations}
            sourceTableId={tableId}
            availableTables={[]}
            onAdd={async () => { toast.info('Relations require the platform connector'); }}
            onDelete={async () => { toast.info('Relations require the platform connector'); }}
          />
        )}
        {activeTab === 'settings' && (
          <SettingsTab
            table={table}
            tenant={tenant}
            appId={appId}
            onSaved={(updated) => setTable(updated)}
          />
        )}
        {activeTab === 'indexes' && (
          <IndexesTab fields={fields} />
        )}
      </div>

      {/* Field editor drawer */}
      <FieldEditor
        key={fieldEditorOpen ? (editingField?.id ?? 'new') : 'closed'}
        open={fieldEditorOpen}
        onClose={() => { setFieldEditorOpen(false); setEditingField(undefined); }}
        mode={editingField ? 'edit' : 'create'}
        initialField={editingField}
        onSave={handleSaveField}
      />
    </div>
  );
}

export default function TableDetailPage() {
  return (
    <React.Suspense fallback={<div className="flex items-center justify-center h-64"><Spinner /></div>}>
      <TableDetailPageInner />
    </React.Suspense>
  );
}
