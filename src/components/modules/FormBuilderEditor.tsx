'use client';

/**
 * Form Builder Editor
 * 
 * Visual interface for creating and editing form configs and fields.
 * Drag-to-reorder fields, configure each field's type and options,
 * set up cascading dropdowns, formula fields, and autofill mappings.
 */

import React, { useState, useCallback, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { Button, Input, Select, Textarea, Modal, Badge, Card } from '@/components/ui';
import {
  Plus, GripVertical, Trash2, ChevronDown, ChevronUp,
  Settings, Eye, Save, ArrowLeft, Type, Hash, Calendar,
  AlignLeft, ChevronDown as Dropdown, CheckSquare, Sigma, Link
} from 'lucide-react';

type FieldType = 'text' | 'number' | 'dropdown' | 'date' | 'textarea' | 'checkbox' | 'formula';

const FIELD_TYPE_CONFIG: Record<FieldType, { label: string; icon: React.ReactNode; color: string }> = {
  text: { label: 'Text', icon: <Type className="w-4 h-4" />, color: 'text-blue-600' },
  number: { label: 'Number', icon: <Hash className="w-4 h-4" />, color: 'text-green-600' },
  dropdown: { label: 'Dropdown', icon: <Dropdown className="w-4 h-4" />, color: 'text-purple-600' },
  date: { label: 'Date', icon: <Calendar className="w-4 h-4" />, color: 'text-orange-600' },
  textarea: { label: 'Long Text', icon: <AlignLeft className="w-4 h-4" />, color: 'text-slate-600' },
  checkbox: { label: 'Checkbox', icon: <CheckSquare className="w-4 h-4" />, color: 'text-teal-600' },
  formula: { label: 'Formula', icon: <Sigma className="w-4 h-4" />, color: 'text-red-600' },
};

interface FieldDraft {
  id: string;
  key: string;
  label: string;
  field_type: FieldType;
  is_line_item: boolean;
  is_required: boolean;
  is_readonly: boolean;
  is_row_number: boolean;
  sort_order: number;
  placeholder: string;
  default_value: string;
  width: 'full' | 'half' | 'third';
  dropdown_type: 'static' | 'dynamic';
  dropdown_static_options: string;       // JSON string for static options
  dropdown_source_table: string;
  dropdown_value_column: string;
  dropdown_label_column: string;
  dropdown_filter_column: string;
  dropdown_filter_field: string;
  dropdown_filter_value: string;
  formula_type: 'sum_column' | 'expression';
  formula_expression: string;
  formula_target_field: string;
  autofill_source_field: string;
  autofill_column: string;
  visible_when_field: string;
  visible_when_value: string;
}

interface FormDraft {
  id?: string;
  name: string;
  slug: string;
  description: string;
  show_as_tab: boolean;
  tab_label: string;
  tab_icon: string;
  pdf_template_url: string;
  autofill_source_field: string;
  autofill_child_table: string;
  autofill_link_column: string;
  board_view_enabled: boolean;
  board_group_by_field: string;
  revisioning_enabled: boolean;
  is_master: boolean;
}

function newFieldDraft(sortOrder: number): FieldDraft {
  return {
    id: `new_${Date.now()}`,
    key: '',
    label: '',
    field_type: 'text',
    is_line_item: false,
    is_required: false,
    is_readonly: false,
    is_row_number: false,
    sort_order: sortOrder,
    placeholder: '',
    default_value: '',
    width: 'full',
    dropdown_type: 'static',
    dropdown_static_options: '[]',
    dropdown_source_table: '',
    dropdown_value_column: 'id',
    dropdown_label_column: 'name',
    dropdown_filter_column: '',
    dropdown_filter_field: '',
    dropdown_filter_value: '',
    formula_type: 'expression',
    formula_expression: '',
    formula_target_field: '',
    autofill_source_field: '',
    autofill_column: '',
    visible_when_field: '',
    visible_when_value: '',
  };
}

interface FormBuilderEditorProps {
  tenantSlug: string;
  initialForm?: Partial<FormDraft & { id: string; fields: FieldDraft[] }>;
  onSave: (form: FormDraft, fields: FieldDraft[]) => Promise<void>;
  onBack: () => void;
}

export function FormBuilderEditor({ tenantSlug, initialForm, onSave, onBack }: FormBuilderEditorProps) {
  const [form, setForm] = useState<FormDraft>({
    id: initialForm?.id,
    name: initialForm?.name ?? '',
    slug: initialForm?.slug ?? '',
    description: initialForm?.description ?? '',
    show_as_tab: initialForm?.show_as_tab ?? false,
    tab_label: initialForm?.tab_label ?? '',
    tab_icon: initialForm?.tab_icon ?? '',
    pdf_template_url: initialForm?.pdf_template_url ?? '',
    autofill_source_field: initialForm?.autofill_source_field ?? '',
    autofill_child_table: initialForm?.autofill_child_table ?? '',
    autofill_link_column: initialForm?.autofill_link_column ?? '',
    board_view_enabled: initialForm?.board_view_enabled ?? false,
    board_group_by_field: initialForm?.board_group_by_field ?? '',
    revisioning_enabled: initialForm?.revisioning_enabled ?? false,
    is_master: initialForm?.is_master ?? false,
  });

  const [fields, setFields] = useState<FieldDraft[]>(
    initialForm?.fields ?? [newFieldDraft(0)]
  );

  const [editingFieldId, setEditingFieldId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<'header' | 'lineitems'>('header');

  const headerFields = fields.filter((f) => !f.is_line_item);
  const lineItemFields = fields.filter((f) => f.is_line_item);
  const displayedFields = tab === 'header' ? headerFields : lineItemFields;

  function updateField(id: string, updates: Partial<FieldDraft>) {
    setFields((prev) =>
      prev.map((f) => (f.id === id ? { ...f, ...updates } : f))
    );
  }

  function addField() {
    const newField = newFieldDraft(displayedFields.length);
    newField.is_line_item = tab === 'lineitems';
    setFields((prev) => [...prev, newField]);
    setEditingFieldId(newField.id);
  }

  function removeField(id: string) {
    setFields((prev) => prev.filter((f) => f.id !== id));
    if (editingFieldId === id) setEditingFieldId(null);
  }

  function moveField(id: string, dir: 'up' | 'down') {
    const list = [...displayedFields];
    const idx = list.findIndex((f) => f.id === id);
    if (dir === 'up' && idx > 0) {
      [list[idx - 1], list[idx]] = [list[idx], list[idx - 1]];
    } else if (dir === 'down' && idx < list.length - 1) {
      [list[idx], list[idx + 1]] = [list[idx + 1], list[idx]];
    }
    const reordered = list.map((f, i) => ({ ...f, sort_order: i }));
    setFields((prev) => [
      ...prev.filter((f) => f.is_line_item !== (tab === 'header')),
      ...reordered,
    ]);
  }

  function autoSlug(name: string) {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }

  async function handleSave() {
    setSaving(true);
    try {
      await onSave(form, fields);
    } finally {
      setSaving(false);
    }
  }

  const editingField = fields.find((f) => f.id === editingFieldId);

  return (
    <div className="flex h-full gap-0">
      {/* Left panel: field list */}
      <div className="w-80 flex-shrink-0 bg-white border-r border-slate-200 flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-slate-200">
          <div className="flex items-center gap-3 mb-3">
            <button onClick={onBack} className="text-slate-400 hover:text-slate-600">
              <ArrowLeft className="w-4 h-4" />
            </button>
            <h2 className="font-semibold text-slate-900 text-sm truncate">{form.name || 'New Form'}</h2>
          </div>
          <Input
            placeholder="Form name"
            value={form.name}
            onChange={(e) => {
              const name = e.target.value;
              setForm((prev) => ({
                ...prev,
                name,
                slug: prev.slug || autoSlug(name),
              }));
            }}
          />
        </div>

        {/* Field tabs */}
        <div className="flex border-b border-slate-200">
          {(['header', 'lineitems'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                'flex-1 py-2.5 text-xs font-medium transition-colors',
                tab === t
                  ? 'border-b-2 border-indigo-600 text-indigo-600'
                  : 'text-slate-500 hover:text-slate-700'
              )}
            >
              {t === 'header' ? `Header (${headerFields.length})` : `Line Items (${lineItemFields.length})`}
            </button>
          ))}
        </div>

        {/* Field list */}
        <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
          {displayedFields.length === 0 && (
            <p className="text-xs text-slate-400 text-center py-8">
              No {tab === 'lineitems' ? 'line item ' : ''}fields yet
            </p>
          )}
          {displayedFields.map((field, idx) => (
            <div
              key={field.id}
              onClick={() => setEditingFieldId(field.id === editingFieldId ? null : field.id)}
              className={cn(
                'group flex items-center gap-2 p-2.5 rounded-lg border cursor-pointer transition-all',
                editingFieldId === field.id
                  ? 'border-indigo-300 bg-indigo-50'
                  : 'border-slate-200 bg-white hover:border-slate-300'
              )}
            >
              <GripVertical className="w-3.5 h-3.5 text-slate-300 flex-shrink-0" />
              <span className={cn('flex-shrink-0', FIELD_TYPE_CONFIG[field.field_type]?.color)}>
                {FIELD_TYPE_CONFIG[field.field_type]?.icon}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-slate-700 truncate">
                  {field.label || <span className="italic text-slate-400">Untitled field</span>}
                </p>
                <p className="text-xs text-slate-400">{FIELD_TYPE_CONFIG[field.field_type]?.label}</p>
              </div>
              <div className="flex gap-1 opacity-0 group-hover:opacity-100">
                <button onClick={(e) => { e.stopPropagation(); moveField(field.id, 'up'); }} disabled={idx === 0}
                  className="p-0.5 text-slate-400 hover:text-slate-600 disabled:opacity-20">
                  <ChevronUp className="w-3 h-3" />
                </button>
                <button onClick={(e) => { e.stopPropagation(); moveField(field.id, 'down'); }} disabled={idx === displayedFields.length - 1}
                  className="p-0.5 text-slate-400 hover:text-slate-600 disabled:opacity-20">
                  <ChevronDown className="w-3 h-3" />
                </button>
                <button onClick={(e) => { e.stopPropagation(); removeField(field.id); }}
                  className="p-0.5 text-slate-400 hover:text-red-500">
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="p-3 border-t border-slate-200">
          <Button
            variant="secondary"
            size="sm"
            className="w-full"
            icon={<Plus className="w-3.5 h-3.5" />}
            onClick={addField}
          >
            Add {tab === 'lineitems' ? 'line item' : ''} field
          </Button>
        </div>
      </div>

      {/* Right panel: field editor or form settings */}
      <div className="flex-1 overflow-y-auto bg-slate-50">
        {editingField ? (
          <FieldEditor
            field={editingField}
            allHeaderFields={headerFields}
            onChange={(updates) => updateField(editingField.id, updates)}
            tenantSlug={tenantSlug}
          />
        ) : (
          <FormSettings form={form} onChange={(updates) => setForm((prev) => ({ ...prev, ...updates }))} tenantSlug={tenantSlug} fields={fields} />
        )}

        {/* Save bar */}
        <div className="sticky bottom-0 bg-white border-t border-slate-200 p-4 flex justify-end gap-3">
          <Button variant="secondary" onClick={onBack}>Discard</Button>
          <Button loading={saving} onClick={handleSave} icon={<Save className="w-4 h-4" />}>
            Save form
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Field editor panel
// ─────────────────────────────────────────────────────────────

function FieldEditor({
  field,
  allHeaderFields,
  onChange,
  tenantSlug,
}: {
  field: FieldDraft;
  allHeaderFields: FieldDraft[];
  onChange: (updates: Partial<FieldDraft>) => void;
  tenantSlug: string;
}) {
  const ft = FIELD_TYPE_CONFIG[field.field_type];
  const [sources, setSources] = useState<Array<{ value: string; label: string }>>([]);
  const [sourceColumns, setSourceColumns] = useState<Array<{ value: string; label: string }>>([]);

  useEffect(() => {
    if (field.field_type !== 'dropdown' || field.dropdown_type !== 'dynamic') return;
    fetch(`/api/tenant/form-builder/available-sources?tenant=${tenantSlug}`)
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) { console.error('[FieldEditor] available-sources failed:', r.status, d); return; }
        setSources(d.sources ?? []);
      })
      .catch((e) => console.error('[FieldEditor] available-sources error:', e));
  }, [field.field_type, field.dropdown_type, tenantSlug]);

  useEffect(() => {
    if (!field.dropdown_source_table) { setSourceColumns([]); return; }
    fetch(`/api/tenant/form-builder/source-columns?tenant=${tenantSlug}&source=${encodeURIComponent(field.dropdown_source_table)}`)
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) { console.error('[FieldEditor] source-columns failed:', r.status, d); return; }
        setSourceColumns(d.columns ?? []);
      })
      .catch((e) => console.error('[FieldEditor] source-columns error:', e));
  }, [field.dropdown_source_table, tenantSlug]);

  return (
    <div className="p-6 space-y-6 max-w-2xl">
      <div className="flex items-center gap-2">
        <span className={ft.color}>{ft.icon}</span>
        <h3 className="font-semibold text-slate-900">Edit field</h3>
        <Badge variant="default">{ft.label}</Badge>
      </div>

      {/* Base settings */}
      <Card>
        <h4 className="text-sm font-semibold text-slate-700 mb-4">Basic</h4>
        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Label"
            value={field.label}
            onChange={(e) => onChange({ label: e.target.value })}
            required
          />
          <Input
            label="Field key (machine name)"
            value={field.key}
            onChange={(e) => onChange({ key: e.target.value.toLowerCase().replace(/\s+/g, '_') })}
            placeholder="e.g. customer_name"
            hint="Unique within form, no spaces"
            required
          />
          <Select
            label="Type"
            value={field.field_type}
            onChange={(e) => onChange({ field_type: e.target.value as FieldType })}
            options={Object.entries(FIELD_TYPE_CONFIG).map(([v, c]) => ({ value: v, label: c.label }))}
          />
          <Select
            label="Width"
            value={field.width}
            onChange={(e) => onChange({ width: e.target.value as FieldDraft['width'] })}
            options={[
              { value: 'full', label: 'Full width' },
              { value: 'half', label: 'Half width' },
              { value: 'third', label: 'One third' },
            ]}
          />
          <Input
            label="Placeholder"
            value={field.placeholder}
            onChange={(e) => onChange({ placeholder: e.target.value })}
          />
          <Input
            label="Default value"
            value={field.default_value}
            onChange={(e) => onChange({ default_value: e.target.value })}
          />
        </div>
        <div className="flex gap-4 mt-4">
          {[
            { key: 'is_required', label: 'Required' },
            { key: 'is_readonly', label: 'Read-only' },
            { key: 'is_row_number', label: 'Row number (auto)' },
          ].map(({ key, label }) => (
            <label key={key} className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
              <input
                type="checkbox"
                checked={Boolean(field[key as keyof FieldDraft])}
                onChange={(e) => onChange({ [key]: e.target.checked })}
                className="w-4 h-4 rounded border-slate-300 text-indigo-600"
              />
              {label}
            </label>
          ))}
        </div>
      </Card>

      {/* Dropdown settings */}
      {field.field_type === 'dropdown' && (
        <Card>
          <h4 className="text-sm font-semibold text-slate-700 mb-4">Dropdown options</h4>
          <div className="space-y-4">
            <Select
              label="Source"
              value={field.dropdown_type}
              onChange={(e) => onChange({ dropdown_type: e.target.value as 'static' | 'dynamic' })}
              options={[
                { value: 'static', label: 'Static list' },
                { value: 'dynamic', label: 'Live from a table or another form' },
              ]}
            />
            {field.dropdown_type === 'static' && (
              <Textarea
                label="Options (one per line: value|label)"
                value={(() => {
                  const raw = field.dropdown_static_options || '[]';
                  try { const p = typeof raw==='string'?JSON.parse(raw):raw; if(Array.isArray(p)&&p.length>0&&typeof p[0]==='object') return p.map((o:{value:string;label:string})=>`${o.value}|${o.label}`).join('\n'); } catch {}
                  return raw;
                })()}
                onChange={(e) => {
                  const lines = e.target.value.split('\n').filter((l:string)=>l.trim());
                  const parsed = lines.map((l:string)=>{const[v,...r]=l.split('|');return{value:v.trim(),label:(r.join('|')||v).trim()};});
                  onChange({ dropdown_static_options: JSON.stringify(parsed) });
                }}
                placeholder="local|Local
outstation|Outstation"
              />
            )}
            {field.dropdown_type === 'dynamic' && (
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <Select
                    label="Source (a real table, or any form marked as Master Data)"
                    value={field.dropdown_source_table}
                    onChange={(e) => onChange({ dropdown_source_table: e.target.value, dropdown_value_column: '', dropdown_label_column: '' })}
                    options={[{ value: '', label: '— Select —' }, ...sources]}
                  />
                </div>
                <Select label="Value column" value={field.dropdown_value_column}
                  onChange={(e) => onChange({ dropdown_value_column: e.target.value })}
                  options={[{ value: '', label: '— Select —' }, ...sourceColumns]} />
                <Select label="Label column" value={field.dropdown_label_column}
                  onChange={(e) => onChange({ dropdown_label_column: e.target.value })}
                  options={[{ value: '', label: '— Select —' }, ...sourceColumns]} />
                <Input label="Filter column (optional)" value={field.dropdown_filter_column}
                  onChange={(e) => onChange({ dropdown_filter_column: e.target.value })} />
                <Select
                  label="Filter depends on field (cascading)"
                  value={field.dropdown_filter_field}
                  onChange={(e) => onChange({ dropdown_filter_field: e.target.value })}
                  options={[{ value: '', label: '— None —' }, ...allHeaderFields.map((f) => ({ value: f.key, label: f.label || f.key }))]}
                />
                <Input label="Fixed filter value (if not cascading)" value={field.dropdown_filter_value}
                  onChange={(e) => onChange({ dropdown_filter_value: e.target.value })} />
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Formula settings */}
      {field.field_type === 'formula' && (
        <Card>
          <h4 className="text-sm font-semibold text-slate-700 mb-4">Formula</h4>
          <div className="space-y-4">
            <Select
              label="Formula type"
              value={field.formula_type}
              onChange={(e) => onChange({ formula_type: e.target.value as 'sum_column' | 'expression' })}
              options={[
                { value: 'expression', label: 'Arithmetic expression (e.g. quantity * unit_price)' },
                { value: 'sum_column', label: 'Sum of a line-item column' },
              ]}
            />
            {field.formula_type === 'expression' && (
              <Input
                label="Expression"
                value={field.formula_expression}
                onChange={(e) => onChange({ formula_expression: e.target.value })}
                placeholder="e.g. quantity * unit_price * (1 - discount_percent / 100)"
                hint="Use other field keys as variable names. Only +, -, *, /, () and numbers allowed."
              />
            )}
            {field.formula_type === 'sum_column' && (
              <Input
                label="Line-item field key to sum"
                value={field.formula_target_field}
                onChange={(e) => onChange({ formula_target_field: e.target.value })}
                placeholder="e.g. amount"
      />
            )}
          </div>
        </Card>
      )}

      {/* Autofill settings */}
      {field.field_type !== 'formula' && (
        <Card>
          <h4 className="text-sm font-semibold text-slate-700 mb-1">Autofill (optional)</h4>
          <p className="text-xs text-slate-400 mb-4">
            When a dropdown on this form changes, automatically fill this field with a value from the same record.
          </p>
          <div className="grid grid-cols-2 gap-4">
            <Select
              label="Triggered by field"
              value={field.autofill_source_field}
              onChange={(e) => onChange({ autofill_source_field: e.target.value })}
              options={[
                { value: '', label: '— None —' },
                ...allHeaderFields
                  .filter((f) => f.field_type === 'dropdown')
                  .map((f) => ({ value: f.key, label: f.label || f.key })),
              ]}
            />
            <Input
              label="Fill from column"
              value={field.autofill_column}
              onChange={(e) => onChange({ autofill_column: e.target.value })}
              placeholder="e.g. company_name"
              hint="Column from the source field's linked table"
          />
        </div>
      </Card>
      )}

      <Card>
        <h4 className="text-sm font-semibold text-slate-700 mb-1">Conditional visibility</h4>
        <p className="text-xs text-slate-400 mb-3">Show this field only when another dropdown has a specific value. Leave blank to always show.</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">Show when field</label>
            <select value={field.visible_when_field ?? ''} onChange={(e) => onChange({ visible_when_field: e.target.value, visible_when_value: '' })} className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400">
              <option value="">Always show</option>
              {allHeaderFields.filter(f => f.key !== field.key && f.field_type === 'dropdown').map(f => (<option key={f.key} value={f.key}>{f.label} ({f.key})</option>))}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">Equals value</label>
            {(() => {
              const cf = allHeaderFields.find(f => f.key === field.visible_when_field);
              const opts: Array<{value:string;label:string}> = cf?.dropdown_type === 'static' ? (() => { try { const raw = cf.dropdown_static_options||'[]'; return typeof raw === 'string' ? JSON.parse(raw) : (Array.isArray(raw) ? raw : []); } catch { return []; } })() : [];
              return opts.length > 0 ? (
                <select value={field.visible_when_value??''} onChange={(e)=>onChange({visible_when_value:e.target.value})} disabled={!field.visible_when_field} className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400 disabled:opacity-40 disabled:bg-slate-50">
                  <option value="">Select value...</option>
                  {opts.map((o:{value:string;label:string})=><option key={o.value} value={o.value}>{o.label} ({o.value})</option>)}
                </select>
              ) : (
                <input value={field.visible_when_value??''} onChange={(e)=>onChange({visible_when_value:e.target.value})} placeholder="Enter exact value" disabled={!field.visible_when_field} className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400 disabled:opacity-40 disabled:bg-slate-50" />
              );
            })()}
          </div>
        </div>
        {field.visible_when_field && field.visible_when_value && (<p className="text-xs text-indigo-600 mt-2 bg-indigo-50 px-3 py-1.5 rounded-lg">Shows only when <strong>{field.visible_when_field}</strong> = <strong>{field.visible_when_value}</strong></p>)}
      </Card>
    </div>
  );
}

// ───────────────────────────────────────────────────────────
// Form-level settings panel
// ──────────────────────────────────────────────────────────────────

function FormSettings({
  form,
  onChange,
  tenantSlug,
  fields,
}: {
  form: FormDraft;
  onChange: (updates: Partial<FormDraft>) => void;
  tenantSlug: string;
  fields: FieldDraft[];
}) {
  return (
    <div className="p-6 space-y-6 max-w-2xl">
      <h3 className="font-semibold text-slate-900">Form settings</h3>

      <Card>
        <h4 className="text-sm font-semibold text-slate-700 mb-4">Basic</h4>
        <div className="grid grid-cols-2 gap-4">
          <Input label="Form name" value={form.name} onChange={(e) => onChange({ name: e.target.value })} required />
          <Input label="Slug (URL-safe)" value={form.slug} onChange={(e) => onChange({ slug: e.target.value })}
            hint="Used in URLs and as identifier" required />
          <div className="col-span-2">
            <Textarea label="Description" value={form.description} onChange={(e) => onChange({ description: e.target.value })} />
          </div>
        </div>
      </Card>

      <Card>
        <h4 className="text-sm font-semibold text-slate-700 mb-1">Board (Kanban) view</h4>
        <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer mb-4">
          <input type="checkbox" checked={form.board_view_enabled}
            onChange={(e) => onChange({ board_view_enabled: e.target.checked })}
            className="w-4 h-4 rounded border-slate-300 text-indigo-600" />
          Let people switch to a drag-and-drop board view, alongside the table
        </label>
        {form.board_view_enabled && (
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Group cards by</label>
            <select
              value={form.board_group_by_field}
              onChange={(e) => onChange({ board_group_by_field: e.target.value })}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
            >
              <option value="">— Select a dropdown field —</option>
              {fields
                .filter((f) => !f.is_line_item && f.field_type === 'dropdown')
                .map((f) => (
                  <option key={f.id} value={f.key}>{f.label}</option>
                ))}
            </select>
            <p className="text-xs text-slate-400 mt-1">
              Each of this field&rsquo;s dropdown options becomes a column. Dragging a card to a
              different column updates that field&rsquo;s value on the record.
            </p>
            {fields.filter((f) => !f.is_line_item && f.field_type === 'dropdown').length === 0 && (
              <p className="text-xs text-amber-600 mt-1">
                Add a dropdown-type header field first (e.g. &ldquo;Stage&rdquo; or &ldquo;Status&rdquo;) to group by.
              </p>
            )}
          </div>
        )}
      </Card>

      <Card>
        <h4 className="text-sm font-semibold text-slate-700 mb-1">Revisioning</h4>
        <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
          <input type="checkbox" checked={form.revisioning_enabled}
            onChange={(e) => onChange({ revisioning_enabled: e.target.checked })}
            className="w-4 h-4 rounded border-slate-300 text-indigo-600" />
          Track versions instead of only overwriting
        </label>
        <p className="text-xs text-slate-400 mt-1">
          When editing a record, people get the choice to save changes as a new
          revision (keeping the old version around) instead of only overwriting it.
          Useful for anything that goes through multiple drafts — quotes, proposals, contracts.
        </p>
      </Card>

      <Card>
        <h4 className="text-sm font-semibold text-slate-700 mb-1">Master data</h4>
        <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
          <input type="checkbox" checked={form.is_master}
            onChange={(e) => onChange({ is_master: e.target.checked })}
            className="w-4 h-4 rounded border-slate-300 text-indigo-600" />
          Let other forms use this one as a dropdown source
        </label>
        <p className="text-xs text-slate-400 mt-1">
          Once checked, this form shows up when configuring any dropdown field
          on any other form — e.g. build a &ldquo;Vendors&rdquo; form, check this,
          and it becomes pickable as the source for a Vendor dropdown elsewhere.
          Add or remove a field here and every form using this as a source
          picks up the change immediately, no separate syncing needed.
        </p>
      </Card>

      <Card>
        <h4 className="text-sm font-semibold text-slate-700 mb-1">Sidebar tab</h4>
        <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer mb-4">
          <input type="checkbox" checked={form.show_as_tab}
            onChange={(e) => onChange({ show_as_tab: e.target.checked })}
            className="w-4 h-4 rounded border-slate-300 text-indigo-600" />
          Show as a sidebar tab
        </label>
        {form.show_as_tab && (
          <div className="grid grid-cols-2 gap-4">
            <Input label="Tab label" value={form.tab_label} onChange={(e) => onChange({ tab_label: e.target.value })} />
            <Input label="Tab icon (lucide name)" value={form.tab_icon} onChange={(e) => onChange({ tab_icon: e.target.value })}
              placeholder="e.g. file-text" hint="Any Lucide icon name" />
          </div>
        )}
      </Card>

      <Card>
        <h4 className="text-sm font-semibold text-slate-700 mb-1">PDF output</h4>
        <p className="text-xs text-slate-400 mb-3">
          Upload a <code className="bg-slate-100 px-1 rounded">.docx</code> template. Use <code className="bg-slate-100 px-1 rounded">{`{field_key}`}</code> for header fields and <code className="bg-slate-100 px-1 rounded">{`{#items}{qty}{/items}`}</code> for line items.
        </p>
        {!form.id ? (
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
            Save this form once first, then come back here to upload a template — the upload needs a real form to attach to.
          </div>
        ) : form.pdf_template_url ? (
          <div className="flex items-center gap-3 p-3 bg-green-50 border border-green-200 rounded-lg">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-green-800">Template uploaded</p>
              <p className="text-xs text-green-600 truncate">{form.pdf_template_url}</p>
            </div>
            <button
              onClick={() => onChange({ pdf_template_url: '' })}
              className="text-xs text-red-600 hover:text-red-700 font-medium"
            >
              Remove
            </button>
          </div>
        ) : (
          <label className="flex flex-col items-center justify-center border-2 border-dashed border-slate-300 rounded-lg p-6 cursor-pointer hover:border-indigo-400 transition-colors">
            <svg className="w-8 h-8 text-slate-300 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            <span className="text-sm text-slate-500">Click to upload .docx template</span>
            <span className="text-xs text-slate-400 mt-1">Max 10MB</span>
            <input type="file" accept=".docx" className="hidden" onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file || !form.id) return;
              const fd = new FormData();
              fd.append('file', file);
              fd.append('formId', form.id);
              const res = await fetch(`/api/tenant/pdf/template?tenant=${tenantSlug}`, { method: 'POST', body: fd });
              if (res.ok) {
                const { url } = await res.json();
                onChange({ pdf_template_url: url });
              }
            }} />
          </label>
        )}
      </Card>
      {form.id && <NotificationRulesCard formId={form.id} tenantSlug={tenantSlug} fields={fields} />}


      <Card>
        <h4 className="text-sm font-semibold text-slate-700 mb-1">Line-item autofill</h4>
        <p className="text-xs text-slate-400 mb-4">
          When a dropdown field is changed, replace the entire line-item table with rows from a linked child table.
        </p>
        <div className="grid grid-cols-2 gap-4">
          <Input label="Source field key" value={form.autofill_source_field}
            onChange={(e) => onChange({ autofill_source_field: e.target.value })}
            placeholder="e.g. quotation_id" />
          <Input label="Child table name" value={form.autofill_child_table}
            onChange={(e) => onChange({ autofill_child_table: e.target.value })}
            placeholder="e.g. quotation_items" />
          <Input label="Link column in child table" value={form.autofill_link_column}
            onChange={(e) => onChange({ autofill_link_column: e.target.value })}
            placeholder="e.g. quotation_id" />
        </div>
      </Card>
    </div>
  );
}
function PdfTemplateCard({
  form,
  tenantSlug,
  onChange,
  onFieldsDetected,
}: {
  form: FormDraft;
  tenantSlug: string;
  onChange: (updates: Partial<FormDraft>) => void;
  onFieldsDetected: (fields: DetectedField[]) => void;
}) {
  const [parsing, setParsing] = useState(false);
  const [driveInput, setDriveInput] = useState('');
  const [detected, setDetected] = useState<DetectedField[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  async function parseFile(file: File) {
    setParsing(true);
    setError(null);
    setDetected(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch(`/api/tenant/pdf/parse-template?tenant=${tenantSlug}`, { method: 'POST', body: fd });
      const d = await res.json();
      if (!res.ok) { setError(d.error ?? 'Failed to parse'); return; }
      setDetected(d.fields ?? []);
      setSelected(new Set((d.fields ?? []).map((f: DetectedField) => f.key)));
      onChange({ pdf_template_url: `upload:${file.name}` });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to parse');
    } finally {
      setParsing(false);
    }
  }

  async function parseDriveUrl() {
    if (!driveInput.trim()) return;
    setParsing(true);
    setError(null);
    setDetected(null);
    try {
      const res = await fetch(`/api/tenant/pdf/parse-template?tenant=${tenantSlug}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ driveUrl: driveInput.trim() }),
      });
      const d = await res.json();
      if (!res.ok) { setError(d.error ?? 'Failed to parse'); return; }
      setDetected(d.fields ?? []);
      setSelected(new Set((d.fields ?? []).map((f: DetectedField) => f.key)));
      onChange({ pdf_template_url: driveInput.trim() });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to parse');
    } finally {
      setParsing(false);
    }
  }

  const headerDetected = detected?.filter((f) => !f.is_line_item) ?? [];
  const lineDetected = detected?.filter((f) => f.is_line_item) ?? [];

  return (
    <Card>
      <h4 className="text-sm font-semibold text-slate-700 mb-1">PDF template</h4>
      <p className="text-xs text-slate-400 mb-3">
        Upload a <code className="bg-slate-100 px-1 rounded">.docx</code> or paste a Google Drive link — we'll detect all{' '}
        <code className="bg-slate-100 px-1 rounded">{'{field_key}'}</code> placeholders and offer to add them as fields automatically.
      </p>

      {form.pdf_template_url && (
        <div className="flex items-center gap-3 p-2.5 bg-green-50 border border-green-200 rounded-lg mb-3">
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-green-800">Template linked</p>
            <p className="text-xs text-green-600 truncate">{form.pdf_template_url}</p>
          </div>
          <button onClick={() => { onChange({ pdf_template_url: '' }); setDetected(null); }}
            className="text-xs text-red-600 hover:text-red-700 font-medium flex-shrink-0">Remove</button>
        </div>
      )}

      <div className="space-y-3">
        {/* Upload */}
        <label className={`flex flex-col items-center justify-center border-2 border-dashed rounded-lg p-4 cursor-pointer transition-colors ${parsing ? 'opacity-50 pointer-events-none' : 'border-slate-300 hover:border-indigo-400'}`}>
          <svg className="w-6 h-6 text-slate-400 mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
          </svg>
          <span className="text-sm text-slate-500">{parsing ? 'Scanning template…' : 'Click to upload .docx template'}</span>
          <input type="file" accept=".docx" className="hidden" disabled={parsing} onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            await parseFile(file);
          }} />
        </label>

        <div className="flex items-center gap-2 text-xs text-slate-400">
          <div className="flex-1 border-t border-slate-200" />
          <span>or</span>
          <div className="flex-1 border-t border-slate-200" />
        </div>

        {/* Drive link */}
        <div className="flex gap-2">
          <input
            className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            placeholder="Paste Google Drive link or file ID"
            value={driveInput}
            onChange={(e) => setDriveInput(e.target.value)}
            disabled={parsing}
          />
          <button
            onClick={parseDriveUrl}
            disabled={parsing || !driveInput.trim()}
            className="px-3 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 disabled:opacity-40 transition-colors"
          >
            {parsing ? '…' : 'Scan'}
          </button>
        </div>
      </div>

      {error && (
        <p className="mt-3 text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg p-2">{error}</p>
      )}

      {detected !== null && detected.length === 0 && (
        <p className="mt-3 text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg p-2">
          No <code>{'{field_key}'}</code> placeholders found. Make sure your template uses this format.
        </p>
      )}

      {detected !== null && detected.length > 0 && (
        <div className="mt-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-slate-700">
              {detected.length} placeholder{detected.length !== 1 ? 's' : ''} detected
            </p>
            <button
              onClick={() => setSelected(selected.size === detected.length ? new Set() : new Set(detected.map(f => f.key)))}
              className="text-xs text-indigo-600 hover:text-indigo-800"
            >
              {selected.size === detected.length ? 'Deselect all' : 'Select all'}
            </button>
          </div>

          {headerDetected.length > 0 && (
            <div>
              <p className="text-xs font-medium text-slate-500 mb-1.5">Header fields</p>
              <div className="space-y-1">
                {headerDetected.map((f) => (
                  <label key={f.key} className="flex items-center gap-2.5 p-2 rounded-lg hover:bg-slate-50 cursor-pointer">
                    <input type="checkbox" checked={selected.has(f.key)}
                      onChange={(e) => {
                        const s = new Set(selected);
                        e.target.checked ? s.add(f.key) : s.delete(f.key);
                        setSelected(s);
                      }}
                      className="w-4 h-4 rounded border-slate-300 text-indigo-600" />
                    <div className="flex-1 min-w-0">
                      <span className="text-sm text-slate-700">{f.label}</span>
                      <span className="ml-2 text-xs text-slate-400 font-mono">{f.key}</span>
                    </div>
                    <span className="text-xs text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">{f.field_type}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {lineDetected.length > 0 && (
            <div>
              <p className="text-xs font-medium text-slate-500 mb-1.5">Line-item fields <span className="text-slate-400">(inside {'{{#items}}...{{/items}}'})</span></p>
              <div className="space-y-1">
                {lineDetected.map((f) => (
                  <label key={f.key} className="flex items-center gap-2.5 p-2 rounded-lg hover:bg-slate-50 cursor-pointer">
                    <input type="checkbox" checked={selected.has(f.key)}
                      onChange={(e) => {
                        const s = new Set(selected);
                        e.target.checked? s.add(f.key) : s.delete(f.key);
                        setSelected(s);
                      }}
                      className="w-4 h-4 rounded border-slate-300 text-indigo-600" />
                    <div className="flex-1 min-w-0">
                      <span className="text-sm text-slate-700">{f.label}</span>
                      <span className="ml-2 text-xs text-slate-400 font-mono">{f.key}</span>
                    </div>
                    <span className="text-xs text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">{f.field_type}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          <button
            disabled={selected.size === 0}
            onClick={() => {
              const toAdd = detected.filter((f) => selected.has(f.key));
              onFieldsDetected(toAdd);
              setDetected(null);
            }}
            className="w-full py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-40 transition-colors"
          >
            Add {selected.size} selected field{selected.size !== 1 ? 's' : ''} to form
          </button>
        </div>
      )}
    </Card>
  );
}

interface DetectedField {
  key: string;
  label: string;
  field_type: 'text' | 'number' | 'date' | 'textarea';
  is_line_item: boolean;
}

interface NotificationRule { id: string; name: string; integration: 'email'|'whatsapp'; recipient_field: string|null; recipient_fixed: string|null; subject_template: string|null; body_template: string; active: boolean; }

function NotificationRulesCard({ formId, tenantSlug, fields }: { formId: string; tenantSlug: string; fields: FieldDraft[]; }) {
  const [rules, setRules] = React.useState<NotificationRule[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [adding, setAdding] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [newRule, setNewRule] = React.useState({ name: '', integration: 'email' as 'email'|'whatsapp', recipient_type: 'fixed' as 'field'|'fixed', recipient_field: '', recipient_fixed: '', subject_template: 'New submission', body_template: 'Hello,\n\nA new submission was received.\n\nRecord ID: {_record_id}\n\nThank you' });

  async function load() {
    setLoading(true);
    try { const r = await fetch(`/api/tenant/integrations/rules?tenant=${tenantSlug}&formId=${formId}`); const d = await r.json(); setRules(d.rules ?? []); } finally { setLoading(false); }
  }
  React.useEffect(() => { load(); }, [formId]);

  async function save() {
    setSaving(true);
    try {
      await fetch(`/api/tenant/integrations/rules?tenant=${tenantSlug}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: newRule.name, integration: newRule.integration, form_id: formId, trigger_type: 'form_submit', recipient_field: newRule.recipient_type === 'field' ? newRule.recipient_field : null, recipient_fixed: newRule.recipient_type === 'fixed' ? newRule.recipient_fixed : null, subject_template: newRule.integration === 'email' ? newRule.subject_template : null, body_template: newRule.body_template }) });
      setAdding(false);
      load();
    } finally { setSaving(false); }
  }

  async function del(id: string) { if (!confirm('Delete?')) return; await fetch(`/api/tenant/integrations/rules?tenant=${tenantSlug}&id=${id}`, { method: 'DELETE' }); load(); }

  const headerFields = fields.filter(f => !f.is_line_item);

  return (
    <Card>
      <div className="flex items-center justify-between mb-3">
        <div><h4 className="text-sm font-semibold text-slate-700">Notifications on Submit</h4><p className="text-xs text-slate-400 mt-0.5">Auto-send WhatsApp or Email when this form is submitted</p></div>
        <button onClick={() => setAdding(true)} className="text-xs px-3 py-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">+ Add rule</button>
      </div>
      {loading ? <p className="text-xs text-slate-400">Loading...</p> : rules.length === 0 && !adding ? (
        <p className="text-center text-sm text-slate-400 py-4">No notification rules yet. Add one to auto-send messages on submit.</p>
      ) : (
        <div className="space-y-2">
          {rules.map(r => (
            <div key={r.id} className="flex items-center gap-3 p-3 border border-slate-100 rounded-lg bg-slate-50">
              <span className="text-lg">{r.integration === 'whatsapp' ? '💬' : '✉️'}</span>
              <div className="flex-1 min-w-0"><p className="text-sm font-medium text-slate-700">{r.name}</p><p className="text-xs text-slate-400 truncate">{r.integration} → {r.recipient_field ? `field:${r.recipient_field}` : r.recipient_fixed}</p></div>
              <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700">Active</span>
              <button onClick={() => del(r.id)} className="text-slate-300 hover:text-red-500 text-xs">✕</button>
            </div>
          ))}
        </div>
      )}
      {adding && (
        <div className="mt-4 p-4 border border-indigo-100 rounded-xl bg-indigo-50 space-y-3">
          <p className="text-sm font-semibold text-slate-700">New notification rule</p>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs text-slate-500">Rule name</label><input value={newRule.name} onChange={e => setNewRule(p => ({...p,name:e.target.value}))} placeholder="e.g. Notify sales team" className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400"/></div>
            <div><label className="text-xs text-slate-500">Channel</label><select value={newRule.integration} onChange={e => setNewRule(p => ({...p,integration:e.target.value as 'email'|'whatsapp'}))} className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400"><option value="email">✉️ Email</option><option value="whatsapp">💬 WhatsApp</option></select></div>
          </div>
          <div><label className="text-xs text-slate-500">Recipient</label>
            <div className="flex gap-2 mt-1">
              <select value={newRule.recipient_type} onChange={e => setNewRule(p => ({...p,recipient_type:e.target.value as 'field'|'fixed'}))} className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400"><option value="fixed">Fixed address</option><option value="field">From form field</option></select>
              {newRule.recipient_type === 'field' ? (
                <select value={newRule.recipient_field} onChange={e => setNewRule(p => ({...p,recipient_field:e.target.value}))} className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400"><option value="">Select field...</option>{headerFields.map(f => <option key={f.key} value={f.key}>{f.label} ({f.key})</option>)}</select>
              ) : (
                <input value={newRule.recipient_fixed} onChange={e => setNewRule(p => ({...p,recipient_fixed:e.target.value}))} placeholder={newRule.integration === 'email' ? 'email@company.com' : '+919876543210'} className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400"/>
              )}
            </div>
          </div>
          {newRule.integration === 'email' && <div><label className="text-xs text-slate-500">Subject</label><input value={newRule.subject_template} onChange={e => setNewRule(p => ({...p,subject_template:e.target.value}))} className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400"/></div>}
          <div>
            <div className="flex items-center justify-between mb-1"><label className="text-xs text-slate-500">Message template</label><span className="text-xs text-slate-400">Use: {[...headerFields.slice(0,3).map(f=>`{${f.key}}`),'{_record_id}'].join(', ')}</span></div>
            <textarea value={newRule.body_template} onChange={e => setNewRule(p => ({...p,body_template:e.target.value}))} rows={5} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-indigo-400 resize-none"/>
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setAdding(false)} className="text-sm px-4 py-2 border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">Cancel</button>
            <button onClick={save} disabled={saving || !newRule.name || !newRule.body_template} className="text-sm px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-40">{saving ? 'Saving...' : 'Save rule'}</button>
          </div>
        </div>
      )}
    </Card>
  );
}
