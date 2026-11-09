'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import type { RelationDef } from '@/platform/contracts/tables';

// ─── Add Relation Modal ───────────────────────────────────────────────────────

interface AddRelationModalProps {
  open: boolean;
  onClose: () => void;
  availableTables: Array<{ id: string; name: string }>;
  onAdd: (rel: Omit<RelationDef, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>;
  sourceTableId: string;
}

function AddRelationModal({ open, onClose, availableTables, onAdd, sourceTableId }: AddRelationModalProps) {
  const [name, setName] = React.useState('');
  const [targetTableId, setTargetTableId] = React.useState('');
  const [type, setType] = React.useState<RelationDef['type']>('one_to_many');
  const [cascadeDelete, setCascadeDelete] = React.useState<RelationDef['cascadeDelete']>('restrict');
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState('');

  async function handleAdd() {
    if (!name.trim()) { setError('Name is required'); return; }
    if (!targetTableId) { setError('Target table is required'); return; }
    setSaving(true);
    setError('');
    try {
      await onAdd({
        name: name.trim(),
        sourceTableId,
        targetTableId,
        type,
        cascadeDelete,
      });
      onClose();
    } catch (err) {
      setError((err as Error).message ?? 'Failed to add relation');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Add Relation" size="md">
      <div className="space-y-4 p-1">
        <div>
          <label className="block text-xs font-medium text-[var(--color-fg-muted)] mb-1">Name</label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Order Lines" />
        </div>
        <div>
          <label className="block text-xs font-medium text-[var(--color-fg-muted)] mb-1">Target Table</label>
          <select
            value={targetTableId}
            onChange={(e) => setTargetTableId(e.target.value)}
            className="w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-surface)] px-3 py-1.5 text-sm text-[var(--color-fg-base)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
          >
            {availableTables.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-[var(--color-fg-muted)] mb-1">Relation Type</label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as RelationDef['type'])}
            className="w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-surface)] px-3 py-1.5 text-sm text-[var(--color-fg-base)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
          >
            <option value="one_to_many">One to Many</option>
            <option value="many_to_many">Many to Many</option>
            <option value="self">Self (recursive)</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-[var(--color-fg-muted)] mb-1">On Delete</label>
          <select
            value={cascadeDelete}
            onChange={(e) => setCascadeDelete(e.target.value as RelationDef['cascadeDelete'])}
            className="w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-surface)] px-3 py-1.5 text-sm text-[var(--color-fg-base)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
          >
            <option value="restrict">Restrict</option>
            <option value="cascade">Cascade</option>
            <option value="set_null">Set Null</option>
          </select>
        </div>

        {error && <p className="text-xs text-[var(--color-danger)]" role="alert">{error}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose} type="button" disabled={saving}>Cancel</Button>
          <Button onClick={handleAdd} loading={saving} type="button">Add Relation</Button>
        </div>
      </div>
    </Modal>
  );
}

// ─── RelationManager ──────────────────────────────────────────────────────────

export interface RelationManagerProps {
  relations: RelationDef[];
  sourceTableId: string;
  availableTables: Array<{ id: string; name: string }>;
  onAdd: (rel: Omit<RelationDef, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>;
  onDelete: (relationId: string) => Promise<void>;
}

function relTypeLabel(type: RelationDef['type']): string {
  switch (type) {
    case 'one_to_many': return '1:M';
    case 'many_to_many': return 'M:M';
    case 'self': return 'Self';
  }
}

export function RelationManager({
  relations,
  sourceTableId,
  availableTables,
  onAdd,
  onDelete,
}: RelationManagerProps) {
  const [showAdd, setShowAdd] = React.useState(false);
  const tableMap = React.useMemo(
    () => Object.fromEntries(availableTables.map((t) => [t.id, t.name])),
    [availableTables]
  );

  return (
    <div className="space-y-4" data-testid="relation-manager">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-[var(--color-fg-base)]">Relations</h3>
        <Button size="sm" onClick={() => setShowAdd(true)} type="button">+ Add Relation</Button>
      </div>

      {relations.length === 0 ? (
        <div className="py-12 text-center">
          <p className="text-sm text-[var(--color-fg-muted)]">No relations yet.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {relations.map((rel) => (
            <div
              key={rel.id}
              className="flex items-center gap-3 px-4 py-3 border border-[var(--color-border)] rounded-[var(--radius-md)] bg-[var(--color-bg-surface)]"
            >
              <div className="flex-1 min-w-0">
                <span className="font-medium text-sm text-[var(--color-fg-base)]">{rel.name}</span>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs text-[var(--color-fg-muted)]">
                    {tableMap[rel.sourceTableId] ?? rel.sourceTableId}
                  </span>
                  <span className="text-xs text-[var(--color-fg-muted)]">→</span>
                  <span className="text-xs text-[var(--color-fg-muted)]">
                    {tableMap[rel.targetTableId] ?? rel.targetTableId}
                  </span>
                </div>
              </div>
              <Badge variant="neutral" className="text-[10px] px-1.5 py-0.5">{relTypeLabel(rel.type)}</Badge>
              {rel.cascadeDelete && (
                <Badge
                  variant="neutral"
                  className={cn(
                    'text-[10px] px-1.5 py-0.5',
                    rel.cascadeDelete === 'cascade' && 'text-[var(--color-danger)]'
                  )}
                >
                  {rel.cascadeDelete}
                </Badge>
              )}
              <button
                type="button"
                onClick={() => onDelete(rel.id)}
                className="p-1.5 rounded hover:bg-[var(--color-danger)] hover:bg-opacity-10 text-[var(--color-fg-muted)] hover:text-[var(--color-danger)] text-xs"
                aria-label={`Delete relation ${rel.name}`}
              >
                x
              </button>
            </div>
          ))}
        </div>
      )}

      <AddRelationModal
        key={showAdd ? 'open' : 'closed'}
        open={showAdd}
        onClose={() => setShowAdd(false)}
        availableTables={availableTables}
        onAdd={onAdd}
        sourceTableId={sourceTableId}
      />
    </div>
  );
}
