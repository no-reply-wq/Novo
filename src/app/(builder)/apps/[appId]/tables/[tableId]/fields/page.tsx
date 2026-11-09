'use client';

/**
 * Fields page — advanced computed field builder.
 *
 * Shows all fields for a table, with dedicated UI for:
 *   - Formula fields (expression editor with CodeMirror)
 *   - Rollup fields (source table / field / aggregate picker)
 *   - Lookup-value fields (relation + source field picker)
 *   - Auto-number fields (format builder with tokens)
 *   - Status-from-rules fields (ranked rule list)
 *
 * Uses the shared FieldEditor component which already renders type-specific
 * panels for all computed field types. This page provides the full-width
 * management surface linked from the table builder tabs.
 */

import * as React from 'react';
import { useParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/toast';
import { FieldEditor } from '@/components/builder/FieldEditor';
import type { FieldDef, FieldType } from '@/platform/contracts/fields';

// ─── Types ────────────────────────────────────────────────────────────────────

interface RawField {
  id: string;
  table_id: string;
  slug: string;
  label: string;
  type: FieldType;
  options: Record<string, unknown> | null;
  is_required: boolean;
  is_unique: boolean;
  field_order: number;
}

const COMPUTED_TYPES = new Set<FieldType>([
  'formula',
  'rollup',
  'lookup_value',
  'auto_number',
  'status_from_rules',
]);

const COMPUTED_LABELS: Record<string, { label: string; badge: string; color: string }> = {
  formula:           { label: 'Formula',          badge: 'fx',  color: 'var(--color-primary)' },
  rollup:            { label: 'Rollup',            badge: 'Σ',   color: '#7c3aed' },
  lookup_value:      { label: 'Lookup Value',      badge: '◈',   color: '#059669' },
  auto_number:       { label: 'Auto Number',       badge: '##',  color: '#d97706' },
  status_from_rules: { label: 'Status from Rules', badge: 'gear',   color: '#dc2626' },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function rawToFieldDef(raw: RawField): Partial<FieldDef> {
  return {
    id: raw.id,
    tableId: raw.table_id,
    name: raw.label,
    apiKey: raw.slug,
    type: raw.type,
    options: raw.options ?? undefined,
    required: raw.is_required,
    unique: raw.is_unique,
    rank: raw.field_order,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

// ─── Field card ───────────────────────────────────────────────────────────────

function FieldCard({
  field,
  onEdit,
}: {
  field: RawField;
  onEdit: (field: RawField) => void;
}) {
  const isComputed = COMPUTED_TYPES.has(field.type);
  const info = COMPUTED_LABELS[field.type];

  return (
    <div
      className="flex items-center gap-3 px-4 py-3 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-surface)] hover:border-[var(--color-primary)] transition-colors"
      data-field-id={field.id}
    >
      {/* Type badge */}
      <span
        className="w-9 h-9 flex items-center justify-center rounded-[var(--radius-sm)] text-xs font-bold shrink-0"
        style={
          isComputed && info
            ? { background: info.color + '20', color: info.color }
            : { background: 'var(--color-bg-muted)', color: 'var(--color-fg-muted)' }
        }
        aria-hidden="true"
      >
        {info?.badge ?? field.type.slice(0, 2).toUpperCase()}
      </span>

      {/* Name + type */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-[var(--color-fg-base)] truncate">{field.label}</p>
        <p className="text-xs text-[var(--color-fg-muted)] truncate">
          {info?.label ?? field.type} · <code className="font-mono">{field.slug}</code>
        </p>
      </div>

      {/* Badges */}
      <div className="flex items-center gap-1 shrink-0">
        {isComputed && (
          <Badge variant="neutral" className="text-[10px] px-1 py-0">computed</Badge>
        )}
        {field.is_required && (
          <Badge variant="neutral" className="text-[10px] px-1 py-0">required</Badge>
        )}
      </div>

      {/* Edit button */}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => onEdit(field)}
        aria-label={`Edit ${field.label}`}
      >
        Edit
      </Button>
    </div>
  );
}

// ─── Auto-number format preview ───────────────────────────────────────────────

function AutoNumberPreview({ options }: { options: Record<string, unknown> }) {
  const prefix = String(options.prefix ?? '');
  const year   = options.includeYear ? new Date().getFullYear() : null;
  const loc    = options.includeLocation ? '{LOC}' : null;
  const pad    = Number(options.padding ?? 4);
  const seq    = '1'.padStart(pad, '0');
  const parts  = [prefix, year, loc, seq].filter(Boolean);
  return (
    <p className="text-xs text-[var(--color-fg-muted)] mt-1">
      Preview: <code className="font-mono text-[var(--color-primary)]">{parts.join('-')}</code>
    </p>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function FieldsPage() {
  const params = useParams() as { appId: string; tableId: string };
  const { appId, tableId } = params;

  // Tenant from URL or fallback to hostname slug
  const [tenant, setTenant] = React.useState<string>('');
  React.useEffect(() => {
    if (typeof window !== 'undefined') {
      const sp = new URLSearchParams(window.location.search);
      const t = sp.get('tenant') ?? window.location.hostname.split('.')[0];
      setTenant(t);
    }
  }, []);

  const toast = useToast();
  const [fields, setFields] = React.useState<RawField[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [editorOpen, setEditorOpen] = React.useState(false);
  const [editingField, setEditingField] = React.useState<Partial<FieldDef> | undefined>();
  const [showComputedOnly, setShowComputedOnly] = React.useState(false);

  // ── Fetch fields ────────────────────────────────────────────────────────────

  const loadFields = React.useCallback(async () => {
    if (!tenant) return;
    setLoading(true);
    try {
      const res = await fetch(
        `/api/builder/apps/${appId}/tables/${tableId}/fields?tenant=${encodeURIComponent(tenant)}`,
      );
      const data = (await res.json()) as { fields?: RawField[]; error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Failed to load fields');
      setFields(data.fields ?? []);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [appId, tableId, tenant, toast]);

  React.useEffect(() => {
    loadFields();
  }, [loadFields]);

  // ── Handlers ────────────────────────────────────────────────────────────────

  function openCreate() {
    setEditingField(undefined);
    setEditorOpen(true);
  }

  function openEdit(raw: RawField) {
    setEditingField(rawToFieldDef(raw));
    setEditorOpen(true);
  }

  async function handleSave(def: Omit<FieldDef, 'id' | 'tableId' | 'createdAt' | 'updatedAt'>) {
    if (!tenant) return;

    const isEdit = Boolean(editingField?.id);
    const url = `/api/builder/apps/${appId}/tables/${tableId}/fields?tenant=${encodeURIComponent(tenant)}`;

    if (isEdit && editingField?.id && COMPUTED_TYPES.has(def.type as FieldType)) {
      // Use PUT to update computed field options
      const res = await fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          updates: [{ id: editingField.id, type: def.type, options: def.options ?? {} }],
        }),
      });
      const data = (await res.json()) as { applied?: string[]; error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Save failed');
    } else if (!isEdit) {
      // Create new field
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: def.name,
          apiKey: def.apiKey,
          type: def.type ?? 'text',
          options: def.options ?? {},
          required: def.required ?? false,
          unique: def.unique ?? false,
        }),
      });
      const data = (await res.json()) as { field?: RawField; error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Create failed');
    }

    toast.success(isEdit ? 'Field updated' : 'Field created');
    setEditorOpen(false);
    await loadFields();
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  const visible = showComputedOnly
    ? fields.filter(f => COMPUTED_TYPES.has(f.type))
    : fields;

  return (
    <div className="max-w-2xl mx-auto py-8 px-4 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold text-[var(--color-fg-base)]">Fields</h1>
          <p className="text-sm text-[var(--color-fg-muted)]">
            Manage table fields including formula, rollup, auto-number, and other computed types.
          </p>
        </div>
        <Button type="button" size="sm" onClick={openCreate}>
          + Add Field
        </Button>
      </div>

      {/* Filter */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setShowComputedOnly(false)}
          className={`text-xs px-2 py-1 rounded-[var(--radius-sm)] border transition-colors ${
            !showComputedOnly
              ? 'border-[var(--color-primary)] bg-[var(--color-primary)] bg-opacity-10 text-[var(--color-primary)]'
              : 'border-[var(--color-border)] text-[var(--color-fg-muted)]'
          }`}
        >
          All ({fields.length})
        </button>
        <button
          type="button"
          onClick={() => setShowComputedOnly(true)}
          className={`text-xs px-2 py-1 rounded-[var(--radius-sm)] border transition-colors ${
            showComputedOnly
              ? 'border-[var(--color-primary)] bg-[var(--color-primary)] bg-opacity-10 text-[var(--color-primary)]'
              : 'border-[var(--color-border)] text-[var(--color-fg-muted)]'
          }`}
        >
          Computed ({fields.filter(f => COMPUTED_TYPES.has(f.type)).length})
        </button>
      </div>

      {/* Auto-number previews for auto_number fields */}
      {fields
        .filter(f => f.type === 'auto_number' && f.options)
        .map(f => (
          <div
            key={`preview-${f.id}`}
            className="px-4 py-2 rounded-[var(--radius-sm)] bg-[var(--color-bg-muted)] border border-[var(--color-border)]"
          >
            <p className="text-xs font-medium text-[var(--color-fg-muted)]">
              Auto-number: <strong>{f.label}</strong>
            </p>
            <AutoNumberPreview options={f.options ?? {}} />
          </div>
        ))}

      {/* Field list */}
      {loading ? (
        <div className="flex justify-center py-12">
          <Spinner size="lg" />
        </div>
      ) : visible.length === 0 ? (
        <div className="text-center py-12 text-[var(--color-fg-muted)] text-sm">
          {showComputedOnly ? 'No computed fields yet.' : 'No fields yet.'}
        </div>
      ) : (
        <div className="space-y-2">
          {visible.map(field => (
            <FieldCard key={field.id} field={field} onEdit={openEdit} />
          ))}
        </div>
      )}

      {/* Editor drawer */}
      <FieldEditor
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        mode={editingField?.id ? 'edit' : 'create'}
        initialField={editingField}
        onSave={handleSave}
      />
    </div>
  );
}
