'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { cn } from '@/lib/utils';
import type { TableRelation, RelationType, CascadeRule } from '@/platform/data/relations';
import type { ChildTableConfig } from '@/platform/data/child-tables';

// ─── Types ────────────────────────────────────────────────────────────────────

interface RelationFormState {
  name: string;
  type: RelationType;
  sourceTableId: string;
  targetTableId: string;
  sourceField: string;
  targetField: string;
  junctionTable: string;
  cascadeOnDelete: CascadeRule;
  cascadeOnUpdate: CascadeRule;
  inverseLabel: string;
}

interface ChildConfigFormState {
  parentTableId: string;
  childTableId: string;
  parentField: string;
  depth: number;
  displayOrder: number;
  label: string;
  allowAdd: boolean;
  allowDelete: boolean;
  allowReorder: boolean;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function emptyRelationForm(tableId: string): RelationFormState {
  return {
    name: '',
    type: 'one_to_many',
    sourceTableId: tableId,
    targetTableId: '',
    sourceField: '',
    targetField: '',
    junctionTable: '',
    cascadeOnDelete: 'restrict',
    cascadeOnUpdate: 'restrict',
    inverseLabel: '',
  };
}

function emptyChildConfigForm(tableId: string): ChildConfigFormState {
  return {
    parentTableId: tableId,
    childTableId: '',
    parentField: '',
    depth: 0,
    displayOrder: 0,
    label: '',
    allowAdd: true,
    allowDelete: true,
    allowReorder: false,
  };
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function RelationsPage() {
  const params = useParams<{ appId: string; tableId: string }>();
  const { appId, tableId } = params;

  const [relations, setRelations] = useState<TableRelation[]>([]);
  const [childConfigs, setChildConfigs] = useState<ChildTableConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showRelationForm, setShowRelationForm] = useState(false);
  const [showChildConfigForm, setShowChildConfigForm] = useState(false);
  const [relationForm, setRelationForm] = useState<RelationFormState>(emptyRelationForm(tableId));
  const [childConfigForm, setChildConfigForm] = useState<ChildConfigFormState>(emptyChildConfigForm(tableId));
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [relRes, cfgRes] = await Promise.all([
        fetch(`/api/builder/apps/${appId}/relations`),
        fetch(`/api/builder/apps/${appId}/child-tables?parentTableId=${tableId}`),
      ]);
      if (!relRes.ok) throw new Error(await relRes.text());
      if (!cfgRes.ok) throw new Error(await cfgRes.text());
      setRelations(await relRes.json());
      setChildConfigs(await cfgRes.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [appId, tableId]);

  useEffect(() => { void load(); }, [load]);

  const saveRelation = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/builder/apps/${appId}/relations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...relationForm,
          targetField: relationForm.targetField || undefined,
          junctionTable: relationForm.junctionTable || undefined,
          inverseLabel: relationForm.inverseLabel || undefined,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      setShowRelationForm(false);
      setRelationForm(emptyRelationForm(tableId));
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const saveChildConfig = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/builder/apps/${appId}/child-tables`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(childConfigForm),
      });
      if (!res.ok) throw new Error(await res.text());
      setShowChildConfigForm(false);
      setChildConfigForm(emptyChildConfigForm(tableId));
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const deleteRelation = async (id: string) => {
    if (!confirm('Delete this relation?')) return;
    await fetch(`/api/builder/apps/${appId}/relations/${id}`, { method: 'DELETE' });
    await load();
  };

  const deleteChildConfig = async (id: string) => {
    if (!confirm('Delete this child table config?')) return;
    await fetch(`/api/builder/apps/${appId}/child-tables/${id}`, { method: 'DELETE' });
    await load();
  };

  if (loading) {
    return <div className="p-6 text-sm text-muted-foreground">Loading relations…</div>;
  }

  return (
    <div className="p-6 max-w-4xl space-y-8">
      <h1 className="text-xl font-semibold">Relations &amp; Child Tables</h1>

      {error && (
        <div className="bg-destructive/10 text-destructive text-sm rounded p-3">{error}</div>
      )}

      {/* ─── Relations section ─────────────────────────────────── */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-medium">Relations</h2>
          <button
            type="button"
            onClick={() => setShowRelationForm(true)}
            className="text-sm text-primary hover:underline"
          >
            + New relation
          </button>
        </div>

        {relations.length === 0 ? (
          <p className="text-sm text-muted-foreground">No relations yet.</p>
        ) : (
          <div className="space-y-2">
            {relations.map((rel) => (
              <div key={rel.id} className="border rounded p-3 flex items-start justify-between gap-4">
                <div>
                  <div className="font-medium text-sm">{rel.name}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {rel.type} · source field: <code>{rel.sourceField}</code>
                    {rel.junctionTable && ` · via ${rel.junctionTable}`}
                    {rel.inverseLabel && ` · inverse: "${rel.inverseLabel}"`}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    delete: {rel.cascadeOnDelete} · update: {rel.cascadeOnUpdate}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => void deleteRelation(rel.id)}
                  className="text-xs text-destructive hover:underline shrink-0"
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        )}

        {showRelationForm && (
          <div className="mt-4 border rounded p-4 space-y-3">
            <h3 className="font-medium text-sm">New Relation</h3>
            <Field label="Name">
              <input value={relationForm.name} onChange={(e) => setRelationForm((f) => ({ ...f, name: e.target.value }))} className={inputCls} />
            </Field>
            <Field label="Type">
              <select value={relationForm.type} onChange={(e) => setRelationForm((f) => ({ ...f, type: e.target.value as RelationType }))} className={inputCls}>
                <option value="one_to_many">One to Many</option>
                <option value="many_to_many">Many to Many</option>
                <option value="self">Self (recursive)</option>
              </select>
            </Field>
            <Field label="Target Table ID">
              <input value={relationForm.targetTableId} onChange={(e) => setRelationForm((f) => ({ ...f, targetTableId: e.target.value }))} className={inputCls} />
            </Field>
            <Field label="Source Field (FK)">
              <input value={relationForm.sourceField} onChange={(e) => setRelationForm((f) => ({ ...f, sourceField: e.target.value }))} className={inputCls} />
            </Field>
            {relationForm.type === 'self' && (
              <Field label="Target Field">
                <input value={relationForm.targetField} onChange={(e) => setRelationForm((f) => ({ ...f, targetField: e.target.value }))} className={inputCls} />
              </Field>
            )}
            {relationForm.type === 'many_to_many' && (
              <Field label="Junction Table">
                <input value={relationForm.junctionTable} onChange={(e) => setRelationForm((f) => ({ ...f, junctionTable: e.target.value }))} className={inputCls} />
              </Field>
            )}
            <Field label="Cascade on Delete">
              <select value={relationForm.cascadeOnDelete} onChange={(e) => setRelationForm((f) => ({ ...f, cascadeOnDelete: e.target.value as CascadeRule }))} className={inputCls}>
                <option value="restrict">Restrict</option>
                <option value="cascade">Cascade</option>
                <option value="set_null">Set Null</option>
              </select>
            </Field>
            <Field label="Cascade on Update">
              <select value={relationForm.cascadeOnUpdate} onChange={(e) => setRelationForm((f) => ({ ...f, cascadeOnUpdate: e.target.value as CascadeRule }))} className={inputCls}>
                <option value="restrict">Restrict</option>
                <option value="cascade">Cascade</option>
                <option value="set_null">Set Null</option>
              </select>
            </Field>
            <Field label="Inverse Label (optional)">
              <input value={relationForm.inverseLabel} onChange={(e) => setRelationForm((f) => ({ ...f, inverseLabel: e.target.value }))} className={inputCls} />
            </Field>
            <div className="flex gap-2 pt-1">
              <button type="button" onClick={() => void saveRelation()} disabled={saving} className="px-3 py-1.5 bg-primary text-primary-foreground text-sm rounded disabled:opacity-50">
                {saving ? 'Saving…' : 'Save'}
              </button>
              <button type="button" onClick={() => setShowRelationForm(false)} className="px-3 py-1.5 text-sm rounded border">
                Cancel
              </button>
            </div>
          </div>
        )}
      </section>

      {/* ─── Child table configs section ───────────────────────── */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-medium">Child Table Display</h2>
          <button
            type="button"
            onClick={() => setShowChildConfigForm(true)}
            className="text-sm text-primary hover:underline"
          >
            + Configure child table
          </button>
        </div>

        {childConfigs.length === 0 ? (
          <p className="text-sm text-muted-foreground">No child tables configured.</p>
        ) : (
          <div className="space-y-2">
            {childConfigs.map((cfg) => (
              <div key={cfg.id} className="border rounded p-3 flex items-start justify-between gap-4">
                <div>
                  <div className="font-medium text-sm">{cfg.label}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    depth: {cfg.depth} · order: {cfg.displayOrder} · field: <code>{cfg.parentField}</code>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {cfg.allowAdd && 'add '}
                    {cfg.allowDelete && 'delete '}
                    {cfg.allowReorder && 'reorder'}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => void deleteChildConfig(cfg.id)}
                  className="text-xs text-destructive hover:underline shrink-0"
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        )}

        {showChildConfigForm && (
          <div className="mt-4 border rounded p-4 space-y-3">
            <h3 className="font-medium text-sm">Configure Child Table</h3>
            <Field label="Child Table ID">
              <input value={childConfigForm.childTableId} onChange={(e) => setChildConfigForm((f) => ({ ...f, childTableId: e.target.value }))} className={inputCls} />
            </Field>
            <Field label="Parent FK Field">
              <input value={childConfigForm.parentField} onChange={(e) => setChildConfigForm((f) => ({ ...f, parentField: e.target.value }))} className={inputCls} />
            </Field>
            <Field label="Label">
              <input value={childConfigForm.label} onChange={(e) => setChildConfigForm((f) => ({ ...f, label: e.target.value }))} className={inputCls} />
            </Field>
            <Field label="Depth">
              <input type="number" value={childConfigForm.depth} onChange={(e) => setChildConfigForm((f) => ({ ...f, depth: parseInt(e.target.value, 10) }))} className={inputCls} />
            </Field>
            <Field label="Display Order">
              <input type="number" value={childConfigForm.displayOrder} onChange={(e) => setChildConfigForm((f) => ({ ...f, displayOrder: parseInt(e.target.value, 10) }))} className={inputCls} />
            </Field>
            <div className="flex gap-4 text-sm">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={childConfigForm.allowAdd} onChange={(e) => setChildConfigForm((f) => ({ ...f, allowAdd: e.target.checked }))} />
                Allow Add
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={childConfigForm.allowDelete} onChange={(e) => setChildConfigForm((f) => ({ ...f, allowDelete: e.target.checked }))} />
                Allow Delete
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={childConfigForm.allowReorder} onChange={(e) => setChildConfigForm((f) => ({ ...f, allowReorder: e.target.checked }))} />
                Allow Reorder
              </label>
            </div>
            <div className="flex gap-2 pt-1">
              <button type="button" onClick={() => void saveChildConfig()} disabled={saving} className="px-3 py-1.5 bg-primary text-primary-foreground text-sm rounded disabled:opacity-50">
                {saving ? 'Saving…' : 'Save'}
              </button>
              <button type="button" onClick={() => setShowChildConfigForm(false)} className="px-3 py-1.5 text-sm rounded border">
                Cancel
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className={cn('text-xs font-medium text-muted-foreground block mb-1')}>{label}</span>
      {children}
    </label>
  );
}

const inputCls = 'w-full border rounded px-2 py-1.5 text-sm bg-background focus:ring-1 focus:ring-ring outline-none';
