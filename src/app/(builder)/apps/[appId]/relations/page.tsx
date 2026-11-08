'use client';

import * as React from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { Link2, Plus, Trash2, ArrowRight } from 'lucide-react';

type RelationType = 'one_to_many' | 'many_to_many' | 'self';
type CascadeRule = 'restrict' | 'cascade' | 'set_null';

interface TableRow { id: string; name: string; api_key: string; }
interface Relation {
  id: string; name: string; type: RelationType;
  sourceTableId: string; targetTableId: string;
  sourceField: string; cascadeOnDelete: CascadeRule; cascadeOnUpdate: CascadeRule;
}

const REL_LABELS: Record<RelationType, string> = {
  one_to_many: 'One to Many', many_to_many: 'Many to Many', self: 'Self',
};

function AddRelationDialog({ appId, tenant, tables, onClose, onAdded }: {
  appId: string; tenant: string; tables: TableRow[];
  onClose: () => void; onAdded: (r: Relation) => void;
}) {
  const [name, setName] = React.useState('');
  const [type, setType] = React.useState<RelationType>('one_to_many');
  const [sourceTableId, setSourceTableId] = React.useState(tables[0]?.id ?? '');
  const [targetTableId, setTargetTableId] = React.useState(tables[0]?.id ?? '');
  const [sourceField, setSourceField] = React.useState('');
  const [cascadeOnDelete, setCascadeOnDelete] = React.useState<CascadeRule>('restrict');
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { setError('Name is required'); return; }
    if (!sourceField.trim()) { setError('Source field (FK) is required'); return; }
    setSaving(true); setError('');
    try {
      const res = await fetch(`/api/builder/apps/${appId}/relations?tenant=${tenant}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), type, sourceTableId, targetTableId, sourceField: sourceField.trim(), cascadeOnDelete, cascadeOnUpdate: 'restrict' }),
      });
      const json = await res.json() as Relation & { error?: string };
      if (!res.ok) throw new Error(json.error ?? 'Failed');
      onAdded(json); onClose();
    } catch (err) { setError((err as Error).message); }
    finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-[var(--color-bg-surface)] border border-[var(--color-border)] rounded-[var(--radius-lg)] p-6 shadow-xl w-full max-w-md mx-4">
        <h2 className="text-base font-semibold text-[var(--color-fg-base)] mb-4">Add Relation</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-[var(--color-fg-muted)] mb-1">Relation Name</label>
            <input autoFocus value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Customer Orders"
              className="w-full px-3 py-2 text-sm border border-[var(--color-border)] rounded-[var(--radius-md)] bg-[var(--color-bg-base)] text-[var(--color-fg-base)] outline-none focus:ring-2 focus:ring-[var(--color-primary)]" />
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--color-fg-muted)] mb-1">Type</label>
            <select value={type} onChange={e => setType(e.target.value as RelationType)}
              className="w-full px-3 py-2 text-sm border border-[var(--color-border)] rounded-[var(--radius-md)] bg-[var(--color-bg-base)] text-[var(--color-fg-base)] outline-none">
              {Object.entries(REL_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-[var(--color-fg-muted)] mb-1">Source Table</label>
              <select value={sourceTableId} onChange={e => setSourceTableId(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-[var(--color-border)] rounded-[var(--radius-md)] bg-[var(--color-bg-base)] text-[var(--color-fg-base)] outline-none">
                {tables.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--color-fg-muted)] mb-1">Target Table</label>
              <select value={targetTableId} onChange={e => setTargetTableId(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-[var(--color-border)] rounded-[var(--radius-md)] bg-[var(--color-bg-base)] text-[var(--color-fg-base)] outline-none">
                {tables.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--color-fg-muted)] mb-1">Foreign Key Field (on source)</label>
            <input value={sourceField} onChange={e => setSourceField(e.target.value)} placeholder="e.g. customer_id"
              className="w-full px-3 py-2 text-sm font-mono border border-[var(--color-border)] rounded-[var(--radius-md)] bg-[var(--color-bg-base)] text-[var(--color-fg-base)] outline-none focus:ring-2 focus:ring-[var(--color-primary)]" />
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--color-fg-muted)] mb-1">On Delete</label>
            <select value={cascadeOnDelete} onChange={e => setCascadeOnDelete(e.target.value as CascadeRule)}
              className="w-full px-3 py-2 text-sm border border-[var(--color-border)] rounded-[var(--radius-md)] bg-[var(--color-bg-base)] text-[var(--color-fg-base)] outline-none">
              <option value="restrict">Restrict</option>
              <option value="cascade">Cascade</option>
              <option value="set_null">Set Null</option>
            </select>
          </div>
          {error && <p className="text-xs text-[var(--color-danger)]">{error}</p>}
          <div className="flex gap-2 justify-end pt-2">
            <button type="button" onClick={onClose} className="px-3 py-1.5 text-sm rounded-[var(--radius-md)] border border-[var(--color-border)] text-[var(--color-fg-base)] hover:bg-[var(--color-bg-muted)]">Cancel</button>
            <button type="submit" disabled={saving} className="px-3 py-1.5 text-sm rounded-[var(--radius-md)] bg-[var(--color-primary)] text-white hover:opacity-90 disabled:opacity-50">
              {saving ? 'Adding…' : 'Add Relation'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function RelationsPageInner() {
  const { appId } = useParams<{ appId: string }>();
  const searchParams = useSearchParams();
  const tenant = searchParams.get('tenant') ?? '';

  const [relations, setRelations] = React.useState<Relation[]>([]);
  const [tables, setTables] = React.useState<TableRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [showAdd, setShowAdd] = React.useState(false);
  const [error, setError] = React.useState('');

  React.useEffect(() => {
    if (!tenant) return;
    let cancelled = false;
    Promise.all([
      fetch(`/api/builder/apps/${appId}/relations?tenant=${tenant}`).then(r => r.json()),
      fetch(`/api/builder/apps/${appId}/tables?tenant=${tenant}`).then(r => r.json()),
    ]).then(([rel, tbl]) => {
      if (cancelled) return;
      if (Array.isArray(rel)) setRelations(rel);
      else setError((rel as { error: string }).error ?? 'Failed to load relations');
      setTables((tbl as { tables?: TableRow[] }).tables ?? []);
    }).catch((err: Error) => { if (!cancelled) setError(err.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [appId, tenant]);

  function getTableName(id: string) {
    return tables.find(t => t.id === id)?.name ?? id.slice(0, 8) + '…';
  }

  async function deleteRelation(id: string) {
    if (!confirm('Delete this relation? This cannot be undone.')) return;
    const res = await fetch(`/api/builder/apps/${appId}/relations/${id}?tenant=${tenant}`, { method: 'DELETE' });
    if (res.ok) setRelations(prev => prev.filter(r => r.id !== id));
  }

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-semibold text-[var(--color-fg-base)]">Relations</h1>
            {!loading && (
              <p className="text-sm text-[var(--color-fg-muted)] mt-0.5">
                {relations.length} {relations.length === 1 ? 'relation' : 'relations'} defined
              </p>
            )}
          </div>
          {!loading && tables.length > 0 && (
            <button onClick={() => setShowAdd(true)}
              className="inline-flex items-center gap-2 px-3 py-2 text-sm rounded-[var(--radius-md)] bg-[var(--color-primary)] text-white hover:opacity-90">
              <Plus className="w-4 h-4" /> Add Relation
            </button>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-40 text-[var(--color-fg-muted)] text-sm">Loading…</div>
        ) : error ? (
          <div className="p-4 rounded-[var(--radius-md)] bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>
        ) : relations.length === 0 ? (
          <div className="text-center py-16 text-[var(--color-fg-muted)]">
            <Link2 className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm font-medium mb-1">No relations yet</p>
            <p className="text-xs">Define how your tables relate to each other.</p>
            {tables.length > 0 && (
              <button onClick={() => setShowAdd(true)}
                className="mt-4 inline-flex items-center gap-2 px-3 py-2 text-sm rounded-[var(--radius-md)] bg-[var(--color-primary)] text-white hover:opacity-90">
                <Plus className="w-4 h-4" /> Add First Relation
              </button>
            )}
          </div>
        ) : (
          <div className="border border-[var(--color-border)] rounded-[var(--radius-lg)] overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)] bg-[var(--color-bg-muted)]">
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-[var(--color-fg-muted)]">Name</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-[var(--color-fg-muted)]">Type</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-[var(--color-fg-muted)]">From</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-[var(--color-fg-muted)]">To</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-[var(--color-fg-muted)]">FK Field</th>
                  <th className="px-4 py-2.5 w-10" />
                </tr>
              </thead>
              <tbody>
                {relations.map(rel => (
                  <tr key={rel.id} className="border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-bg-muted)]">
                    <td className="px-4 py-2.5 font-medium text-[var(--color-fg-base)]">{rel.name}</td>
                    <td className="px-4 py-2.5">
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-[var(--color-bg-muted)] text-[var(--color-fg-muted)] border border-[var(--color-border)]">
                        {REL_LABELS[rel.type]}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-[var(--color-fg-base)]">{getTableName(rel.sourceTableId)}</td>
                    <td className="px-4 py-2.5">
                      <span className="flex items-center gap-1.5 text-[var(--color-fg-base)]">
                        <ArrowRight className="w-3.5 h-3.5 text-[var(--color-fg-muted)]" />
                        {getTableName(rel.targetTableId)}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs text-[var(--color-fg-muted)]">{rel.sourceField}</td>
                    <td className="px-4 py-2.5">
                      <button onClick={() => deleteRelation(rel.id)}
                        className="p-1 rounded text-[var(--color-fg-muted)] hover:text-[var(--color-danger)] hover:bg-[var(--color-bg-muted)] transition-colors" aria-label="Delete">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {showAdd && (
        <AddRelationDialog appId={appId} tenant={tenant} tables={tables}
          onClose={() => setShowAdd(false)} onAdded={r => setRelations(prev => [...prev, r])} />
      )}
    </div>
  );
}

export default function RelationsPage() {
  return <React.Suspense><RelationsPageInner /></React.Suspense>;
}
