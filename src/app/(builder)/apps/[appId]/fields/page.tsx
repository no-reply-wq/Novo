'use client';

import * as React from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { Database, Plus, Trash2, ChevronDown, ChevronRight } from 'lucide-react';

interface TableRow {
  id: string;
  name: string;
  api_key: string;
  field_count?: number;
}

interface FieldRow {
  id: string;
  table_id: string;
  name: string;
  api_key: string;
  field_type: string;
  required: boolean;
  field_order: number;
  default_value?: string | null;
  options?: Record<string, unknown> | null;
}

const FIELD_TYPE_LABELS: Record<string, string> = {
  text: 'Text',
  number: 'Number',
  boolean: 'Boolean',
  date: 'Date',
  datetime: 'Date & Time',
  select: 'Select',
  multi_select: 'Multi-select',
  relation: 'Relation',
  file: 'File',
  rich_text: 'Rich Text',
  email: 'Email',
  phone: 'Phone',
  url: 'URL',
  currency: 'Currency',
  percentage: 'Percentage',
  rating: 'Rating',
  formula: 'Formula',
  lookup: 'Lookup',
  rollup: 'Rollup',
};

function FieldTypeBadge({ type }: { type: string }) {
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-[var(--color-bg-muted)] text-[var(--color-fg-muted)] border border-[var(--color-border)]">
      {FIELD_TYPE_LABELS[type] ?? type}
    </span>
  );
}

function AddFieldDialog({
  tableId,
  appId,
  tenant,
  onClose,
  onAdded,
}: {
  tableId: string;
  appId: string;
  tenant: string;
  onClose: () => void;
  onAdded: (field: FieldRow) => void;
}) {
  const [name, setName] = React.useState('');
  const [apiKey, setApiKey] = React.useState('');
  const [fieldType, setFieldType] = React.useState('text');
  const [required, setRequired] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState('');

  function handleNameChange(v: string) {
    setName(v);
    setApiKey(v.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, ''));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { setError('Name is required'); return; }
    setSaving(true);
    setError('');
    try {
      const res = await fetch(
        `/api/builder/apps/${appId}/tables/${tableId}/fields?tenant=${tenant}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: name.trim(), apiKey, fieldType, required }),
        }
      );
      const json = (await res.json()) as { field?: FieldRow; error?: string };
      if (!res.ok) throw new Error(json.error ?? 'Failed to create field');
      onAdded(json.field!);
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-[var(--color-bg-surface)] border border-[var(--color-border)] rounded-[var(--radius-lg)] p-6 shadow-xl w-full max-w-md mx-4">
        <h2 className="text-base font-semibold text-[var(--color-fg-base)] mb-4">Add Field</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-[var(--color-fg-muted)] mb-1">Field Name</label>
            <input
              autoFocus
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="e.g. First Name"
              className="w-full px-3 py-2 text-sm border border-[var(--color-border)] rounded-[var(--radius-md)] bg-[var(--color-bg-base)] text-[var(--color-fg-base)] outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--color-fg-muted)] mb-1">API Key</label>
            <input
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="auto-generated"
              className="w-full px-3 py-2 text-sm border border-[var(--color-border)] rounded-[var(--radius-md)] bg-[var(--color-bg-muted)] text-[var(--color-fg-muted)] outline-none font-mono"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--color-fg-muted)] mb-1">Field Type</label>
            <select
              value={fieldType}
              onChange={(e) => setFieldType(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-[var(--color-border)] rounded-[var(--radius-md)] bg-[var(--color-bg-base)] text-[var(--color-fg-base)] outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
            >
              {Object.entries(FIELD_TYPE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <input
              id="required-chk"
              type="checkbox"
              checked={required}
              onChange={(e) => setRequired(e.target.checked)}
              className="w-4 h-4 rounded border-[var(--color-border)] accent-[var(--color-primary)]"
            />
            <label htmlFor="required-chk" className="text-sm text-[var(--color-fg-base)]">Required</label>
          </div>
          {error && <p className="text-xs text-[var(--color-danger)]">{error}</p>}
          <div className="flex gap-2 justify-end pt-2">
            <button type="button" onClick={onClose} className="px-3 py-1.5 text-sm rounded-[var(--radius-md)] border border-[var(--color-border)] text-[var(--color-fg-base)] hover:bg-[var(--color-bg-muted)]">Cancel</button>
            <button type="submit" disabled={saving} className="px-3 py-1.5 text-sm rounded-[var(--radius-md)] bg-[var(--color-primary)] text-white hover:opacity-90 disabled:opacity-50">
              {saving ? 'Adding…' : 'Add Field'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function TableFieldsSection({
  table,
  appId,
  tenant,
}: {
  table: TableRow;
  appId: string;
  tenant: string;
}) {
  const [expanded, setExpanded] = React.useState(false);
  const [fields, setFields] = React.useState<FieldRow[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [loaded, setLoaded] = React.useState(false);
  const [showAdd, setShowAdd] = React.useState(false);

  async function loadFields() {
    if (loaded) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/builder/apps/${appId}/tables/${table.id}/fields?tenant=${tenant}`);
      const json = (await res.json()) as { fields?: FieldRow[]; error?: string };
      setFields(json.fields ?? []);
      setLoaded(true);
    } finally {
      setLoading(false);
    }
  }

  function toggle() {
    if (!expanded) loadFields();
    setExpanded((v) => !v);
  }

  async function deleteField(fieldId: string) {
    if (!confirm('Delete this field? This cannot be undone.')) return;
    const res = await fetch(
      `/api/builder/apps/${appId}/tables/${table.id}/fields/${fieldId}?tenant=${tenant}`,
      { method: 'DELETE' }
    );
    if (res.ok) setFields((prev) => prev.filter((f) => f.id !== fieldId));
  }

  return (
    <div className="border border-[var(--color-border)] rounded-[var(--radius-lg)] overflow-hidden">
      <button
        onClick={toggle}
        className="w-full flex items-center gap-3 px-4 py-3 bg-[var(--color-bg-surface)] hover:bg-[var(--color-bg-muted)] transition-colors text-left"
      >
        {expanded
          ? <ChevronDown className="w-4 h-4 text-[var(--color-fg-muted)] flex-shrink-0" />
          : <ChevronRight className="w-4 h-4 text-[var(--color-fg-muted)] flex-shrink-0" />}
        <Database className="w-4 h-4 text-[var(--color-primary)] flex-shrink-0" />
        <span className="font-medium text-sm text-[var(--color-fg-base)]">{table.name}</span>
        <span className="ml-auto text-xs text-[var(--color-fg-muted)] font-mono">{table.api_key}</span>
      </button>

      {expanded && (
        <div className="border-t border-[var(--color-border)]">
          {loading ? (
            <div className="px-4 py-6 text-sm text-[var(--color-fg-muted)] text-center">Loading fields…</div>
          ) : fields.length === 0 ? (
            <div className="px-4 py-6 text-sm text-[var(--color-fg-muted)] text-center">No fields yet</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)] bg-[var(--color-bg-muted)]">
                  <th className="px-4 py-2 text-left text-xs font-medium text-[var(--color-fg-muted)]">Name</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-[var(--color-fg-muted)]">API Key</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-[var(--color-fg-muted)]">Type</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-[var(--color-fg-muted)]">Required</th>
                  <th className="px-4 py-2 w-10" />
                </tr>
              </thead>
              <tbody>
                {fields.map((field) => (
                  <tr key={field.id} className="border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-bg-muted)]">
                    <td className="px-4 py-2.5 font-medium text-[var(--color-fg-base)]">{field.name}</td>
                    <td className="px-4 py-2.5 font-mono text-xs text-[var(--color-fg-muted)]">{field.api_key}</td>
                    <td className="px-4 py-2.5"><FieldTypeBadge type={field.field_type} /></td>
                    <td className="px-4 py-2.5 text-[var(--color-fg-muted)]">{field.required ? 'Yes' : '—'}</td>
                    <td className="px-4 py-2.5">
                      <button
                        onClick={() => deleteField(field.id)}
                        className="p-1 rounded text-[var(--color-fg-muted)] hover:text-[var(--color-danger)] hover:bg-[var(--color-bg-muted)] transition-colors"
                        aria-label="Delete field"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div className="px-4 py-2 border-t border-[var(--color-border)] bg-[var(--color-bg-muted)]">
            <button
              onClick={() => setShowAdd(true)}
              className="inline-flex items-center gap-1.5 text-xs text-[var(--color-primary)] hover:underline"
            >
              <Plus className="w-3.5 h-3.5" /> Add Field
            </button>
          </div>
        </div>
      )}

      {showAdd && (
        <AddFieldDialog
          tableId={table.id}
          appId={appId}
          tenant={tenant}
          onClose={() => setShowAdd(false)}
          onAdded={(f) => setFields((prev) => [...prev, f])}
        />
      )}
    </div>
  );
}

function FieldsPageInner() {
  const { appId } = useParams<{ appId: string }>();
  const searchParams = useSearchParams();
  const tenant = searchParams.get('tenant') ?? '';

  const [tables, setTables] = React.useState<TableRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');

  React.useEffect(() => {
    if (!tenant) return;
    let cancelled = false;
    fetch(`/api/builder/apps/${appId}/tables?tenant=${tenant}`)
      .then((res) => res.json() as Promise<{ tables?: TableRow[]; error?: string }>)
      .then((data) => {
        if (!cancelled) {
          if (data.error) setError(data.error);
          else setTables(data.tables ?? []);
        }
      })
      .catch((err: Error) => { if (!cancelled) setError(err.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [appId, tenant]);

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-semibold text-[var(--color-fg-base)]">Fields</h1>
            {!loading && (
              <p className="text-sm text-[var(--color-fg-muted)] mt-0.5">
                {tables.length} {tables.length === 1 ? 'table' : 'tables'} — expand to view and add fields
              </p>
            )}
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-40 text-[var(--color-fg-muted)] text-sm">Loading tables…</div>
        ) : error ? (
          <div className="p-4 rounded-[var(--radius-md)] bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>
        ) : tables.length === 0 ? (
          <div className="text-center py-16 text-[var(--color-fg-muted)]">
            <Database className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">No tables yet. Create a table first to add fields.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {tables.map((table) => (
              <TableFieldsSection key={table.id} table={table} appId={appId} tenant={tenant} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function FieldsPage() {
  return (
    <React.Suspense>
      <FieldsPageInner />
    </React.Suspense>
  );
}
