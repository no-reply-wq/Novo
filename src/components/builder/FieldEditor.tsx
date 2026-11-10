'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { Drawer } from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { FieldTypePicker } from './FieldTypePicker';
import { ExpressionEditor } from './ExpressionEditor';
import type { FieldDef, FieldType, ChoiceOption } from '@/platform/contracts/fields';
import type { VisibilityRule } from '@/components/runtime/components/FormComponent';

// ─── Slugify helper ───────────────────────────────────────────────────────────

function toApiKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60);
}

// ─── Type-specific panels ─────────────────────────────────────────────────────

interface PanelProps {
  options: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
}

function TextPanel({ options, onChange }: PanelProps) {
  return (
    <div className="space-y-3">
      <div>
        <label className="block text-xs font-medium text-[var(--color-fg-muted)] mb-1">Max Length</label>
        <Input
          type="number"
          value={String(options.maxLength ?? '')}
          onChange={(e: { target: { value: string } }) => onChange('maxLength', e.target.value ? Number(e.target.value) : undefined)}
          placeholder="2048"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-[var(--color-fg-muted)] mb-1">Regex Pattern</label>
        <Input
          value={String(options.pattern ?? '')}
          onChange={(e: { target: { value: string } }) => onChange('pattern', e.target.value || undefined)}
          placeholder="e.g. ^[A-Z]+"
        />
      </div>
    </div>
  );
}

function LongTextPanel({ options, onChange }: PanelProps) {
  return (
    <div>
      <label className="block text-xs font-medium text-[var(--color-fg-muted)] mb-1">Rows</label>
      <Input
        type="number"
        value={String(options.rows ?? '')}
        onChange={(e: { target: { value: string } }) => onChange('rows', e.target.value ? Number(e.target.value) : undefined)}
        placeholder="4"
      />
    </div>
  );
}

function NumberPanel({ options, onChange }: PanelProps) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-xs font-medium text-[var(--color-fg-muted)] mb-1">Min</label>
          <Input
            type="number"
            value={String(options.min ?? '')}
            onChange={(e: { target: { value: string } }) => onChange('min', e.target.value ? Number(e.target.value) : undefined)}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-[var(--color-fg-muted)] mb-1">Max</label>
          <Input
            type="number"
            value={String(options.max ?? '')}
            onChange={(e: { target: { value: string } }) => onChange('max', e.target.value ? Number(e.target.value) : undefined)}
          />
        </div>
      </div>
      <div>
        <label className="block text-xs font-medium text-[var(--color-fg-muted)] mb-1">Decimal Places</label>
        <Input
          type="number"
          value={String(options.precision ?? '')}
          onChange={(e: { target: { value: string } }) => onChange('precision', e.target.value ? Number(e.target.value) : undefined)}
          placeholder="2"
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-xs font-medium text-[var(--color-fg-muted)] mb-1">Prefix</label>
          <Input
            value={String(options.prefix ?? '')}
            onChange={(e: { target: { value: string } }) => onChange('prefix', e.target.value || undefined)}
            placeholder="$"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-[var(--color-fg-muted)] mb-1">Suffix</label>
          <Input
            value={String(options.suffix ?? '')}
            onChange={(e: { target: { value: string } }) => onChange('suffix', e.target.value || undefined)}
            placeholder="kg"
          />
        </div>
      </div>
    </div>
  );
}

function ChoicePanel({ options, onChange }: PanelProps) {
  const choices = (options.choices as ChoiceOption[] | undefined) ?? [];

  function addChoice() {
    const newChoice: ChoiceOption = {
      value: `option_${choices.length + 1}`,
      label: `Option ${choices.length + 1}`,
      rank: choices.length,
    };
    onChange('choices', [...choices, newChoice]);
  }

  function updateChoice(idx: number, patch: Partial<ChoiceOption>) {
    const updated = choices.map((c, i) => (i === idx ? { ...c, ...patch } : c));
    onChange('choices', updated);
  }

  function removeChoice(idx: number) {
    onChange('choices', choices.filter((_, i) => i !== idx));
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-[var(--color-fg-muted)]">Options</span>
        <Button size="sm" variant="secondary" onClick={addChoice} type="button">+ Add</Button>
      </div>
      <div className="space-y-2 max-h-48 overflow-y-auto">
        {choices.map((choice, idx) => (
          <div key={idx} className="flex items-center gap-2">
            <input
              type="color"
              value={choice.color ?? '#6366f1'}
              onChange={(e: { target: { value: string } }) => updateChoice(idx, { color: e.target.value })}
              className="w-6 h-6 rounded cursor-pointer border-0 p-0"
              aria-label="Choice color"
            />
            <Input
              value={choice.label}
              onChange={(e: { target: { value: string } }) => updateChoice(idx, { label: e.target.value, value: toApiKey(e.target.value) || choice.value })}
              className="flex-1 text-sm"
              placeholder="Label"
            />
            <button
              type="button"
              onClick={() => removeChoice(idx)}
              className="text-[var(--color-danger)] hover:opacity-80 text-sm px-1"
              aria-label="Remove option"
            >
              ×
            </button>
          </div>
        ))}
        {choices.length === 0 && (
          <p className="text-xs text-[var(--color-fg-muted)] italic">No options yet. Add one above.</p>
        )}
      </div>
    </div>
  );
}

function DatePanel({ options, onChange }: PanelProps) {
  return (
    <div>
      <label className="block text-xs font-medium text-[var(--color-fg-muted)] mb-1">Format</label>
      <Input
        value={String(options.format ?? '')}
        onChange={(e: { target: { value: string } }) => onChange('format', e.target.value || undefined)}
        placeholder="DD/MM/YYYY"
      />
    </div>
  );
}

function FormulaPanel({ options, onChange }: PanelProps) {
  return (
    <div className="space-y-3">
      <div>
        <label className="block text-xs font-medium text-[var(--color-fg-muted)] mb-1">Expression</label>
        <ExpressionEditor
          value={String(options.expression ?? '')}
          fieldHints={[]}
          onChange={(v) => onChange('expression', v)}
          placeholder="e.g. {qty} * {unit_price}"
          rows={4}
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-[var(--color-fg-muted)] mb-1">Return Type</label>
        <select
          value={String(options.returnType ?? 'number')}
          onChange={(e: { target: { value: string } }) => onChange('returnType', e.target.value)}
          className="w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-surface)] px-3 py-1.5 text-sm text-[var(--color-fg-base)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
        >
          <option value="number">Number</option>
          <option value="text">Text</option>
          <option value="boolean">Boolean</option>
          <option value="date">Date</option>
        </select>
      </div>
    </div>
  );
}

function RollupPanel({ options, onChange }: PanelProps) {
  return (
    <div className="space-y-3">
      <div>
        <label className="block text-xs font-medium text-[var(--color-fg-muted)] mb-1">Source Relation ID</label>
        <Input
          value={String(options.sourceRelationId ?? '')}
          onChange={(e: { target: { value: string } }) => onChange('sourceRelationId', e.target.value)}
          placeholder="relation_id"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-[var(--color-fg-muted)] mb-1">Source Field ID</label>
        <Input
          value={String(options.sourceFieldId ?? '')}
          onChange={(e: { target: { value: string } }) => onChange('sourceFieldId', e.target.value)}
          placeholder="field_id"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-[var(--color-fg-muted)] mb-1">Aggregation</label>
        <select
          value={String(options.aggregation ?? 'sum')}
          onChange={(e: { target: { value: string } }) => onChange('aggregation', e.target.value)}
          className="w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-surface)] px-3 py-1.5 text-sm text-[var(--color-fg-base)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
        >
          <option value="sum">Sum</option>
          <option value="count">Count</option>
          <option value="avg">Average</option>
          <option value="min">Min</option>
          <option value="max">Max</option>
          <option value="count_distinct">Count Distinct</option>
        </select>
      </div>
      <div>
        <label className="block text-xs font-medium text-[var(--color-fg-muted)] mb-1">Filter Expression (optional)</label>
        <ExpressionEditor
          value={String(options.filterExpr ?? '')}
          fieldHints={[]}
          onChange={(v) => onChange('filterExpr', v || undefined)}
          placeholder="e.g. {status} == 'active'"
          rows={2}
        />
      </div>
    </div>
  );
}

function AutoNumberPanel({ options, onChange }: PanelProps) {
  return (
    <div className="space-y-3">
      <div>
        <label className="block text-xs font-medium text-[var(--color-fg-muted)] mb-1">Prefix</label>
        <Input
          value={String(options.prefix ?? '')}
          onChange={(e: { target: { value: string } }) => onChange('prefix', e.target.value || undefined)}
          placeholder="PO-"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-[var(--color-fg-muted)] mb-1">Zero-pad Digits</label>
        <Input
          type="number"
          value={String(options.padding ?? '')}
          onChange={(e: { target: { value: string } }) => onChange('padding', e.target.value ? Number(e.target.value) : undefined)}
          placeholder="4"
        />
      </div>
      <div className="flex items-center gap-2">
        <Switch
          checked={Boolean(options.includeYear)}
          onChange={(v) => onChange('includeYear', v)}
          id="include-year"
        />
        <label htmlFor="include-year" className="text-sm text-[var(--color-fg-base)]">Include year</label>
      </div>
      <div>
        <label className="block text-xs font-medium text-[var(--color-fg-muted)] mb-1">Reset Rule</label>
        <select
          value={String(options.resetRule ?? 'never')}
          onChange={(e: { target: { value: string } }) => onChange('resetRule', e.target.value)}
          className="w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-surface)] px-3 py-1.5 text-sm text-[var(--color-fg-base)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
        >
          <option value="never">Never</option>
          <option value="yearly">Yearly</option>
          <option value="monthly">Monthly</option>
        </select>
      </div>
    </div>
  );
}

function LookupValuePanel({ options, onChange }: PanelProps) {
  return (
    <div className="space-y-3">
      <div>
        <label className="block text-xs font-medium text-[var(--color-fg-muted)] mb-1">Through Relation ID</label>
        <Input
          value={String(options.relationId ?? '')}
          onChange={(e: { target: { value: string } }) => onChange('relationId', e.target.value)}
          placeholder="relation_id"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-[var(--color-fg-muted)] mb-1">Source Field ID</label>
        <Input
          value={String(options.sourceFieldId ?? '')}
          onChange={(e: { target: { value: string } }) => onChange('sourceFieldId', e.target.value)}
          placeholder="field_id"
        />
      </div>
    </div>
  );
}

interface StatusRule {
  label: string;
  color?: string;
  condition: string;
  rank: number;
}

function StatusFromRulesPanel({ options, onChange }: PanelProps) {
  const rules = (options.rules as StatusRule[] | undefined) ?? [];
  const defaultStatus = String(options.defaultStatus ?? '');

  function addRule() {
    const newRule: StatusRule = {
      label: `Status ${rules.length + 1}`,
      condition: '',
      rank: rules.length,
    };
    onChange('rules', [...rules, newRule]);
  }

  function updateRule(idx: number, patch: Partial<StatusRule>) {
    onChange('rules', rules.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }

  function removeRule(idx: number) {
    onChange('rules', rules.filter((_, i) => i !== idx));
  }

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-xs font-medium text-[var(--color-fg-muted)] mb-1">Default Status</label>
        <Input
          value={defaultStatus}
          onChange={(e: { target: { value: string } }) => onChange('defaultStatus', e.target.value)}
          placeholder="pending"
        />
      </div>
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-[var(--color-fg-muted)]">Rules (lower rank wins)</span>
        <Button size="sm" variant="secondary" onClick={addRule} type="button">+ Add Rule</Button>
      </div>
      <div className="space-y-3 max-h-56 overflow-y-auto">
        {rules.map((rule, idx) => (
          <div key={idx} className="rounded-[var(--radius-md)] border border-[var(--color-border)] p-3 space-y-2">
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={rule.color ?? '#6366f1'}
                onChange={(e: { target: { value: string } }) => updateRule(idx, { color: e.target.value })}
                className="w-6 h-6 rounded cursor-pointer border-0 p-0"
                aria-label="Rule color"
              />
              <Input
                value={rule.label}
                onChange={(e: { target: { value: string } }) => updateRule(idx, { label: e.target.value })}
                placeholder="Status label"
                className="flex-1 text-sm"
              />
              <button
                type="button"
                onClick={() => removeRule(idx)}
                className="text-[var(--color-danger)] hover:opacity-80 text-sm px-1"
                aria-label="Remove rule"
              >
                ×
              </button>
            </div>
            <ExpressionEditor
              value={rule.condition}
          fieldHints={[]}
              onChange={(v) => updateRule(idx, { condition: v })}
              placeholder="Condition expression"
              rows={2}
            />
          </div>
        ))}
        {rules.length === 0 && (
          <p className="text-xs text-[var(--color-fg-muted)] italic">No rules yet. Add one above.</p>
        )}
      </div>
    </div>
  );
}

function FilePanel({ options, onChange }: PanelProps) {
  return (
    <div className="space-y-3">
      <div>
        <label className="block text-xs font-medium text-[var(--color-fg-muted)] mb-1">Max Size (MB)</label>
        <Input
          type="number"
          value={String(options.maxSizeMb ?? '')}
          onChange={(e: { target: { value: string } }) => onChange('maxSizeMb', e.target.value ? Number(e.target.value) : undefined)}
          placeholder="10"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-[var(--color-fg-muted)] mb-1">
          Allowed MIME Types (comma-separated, empty = all)
        </label>
        <Input
          value={Array.isArray(options.allowedMimeTypes) ? (options.allowedMimeTypes as string[]).join(', ') : ''}
          onChange={(e: { target: { value: string } }) =>
            onChange(
              'allowedMimeTypes',
              e.target.value
                ? e.target.value.split(',').map((s) => s.trim()).filter(Boolean)
                : undefined
            )
          }
          placeholder="image/png, application/pdf"
        />
      </div>
    </div>
  );
}

const HAS_TYPE_PANEL = new Set<FieldType>([
  'text', 'long_text', 'integer', 'decimal', 'currency', 'percent',
  'dropdown', 'multi_select', 'radio',
  'date', 'datetime', 'time', 'date_range',
  'formula', 'rollup', 'auto_number', 'lookup_value', 'status_from_rules',
  'file', 'image',
]);

// ─── TypePanelRenderer — renders the type-specific panel without dynamic component creation ───

function TypePanelRenderer({ type, options, onChange }: { type: FieldType; options: Record<string, unknown>; onChange: (key: string, value: unknown) => void }) {
  const p: PanelProps = { options, onChange };
  if (type === 'text') return <TextPanel {...p} />;
  if (type === 'long_text') return <LongTextPanel {...p} />;
  if (type === 'integer' || type === 'decimal' || type === 'currency' || type === 'percent') return <NumberPanel {...p} />;
  if (type === 'dropdown' || type === 'multi_select' || type === 'radio') return <ChoicePanel {...p} />;
  if (type === 'date' || type === 'datetime' || type === 'time' || type === 'date_range') return <DatePanel {...p} />;
  if (type === 'formula') return <FormulaPanel {...p} />;
  if (type === 'rollup') return <RollupPanel {...p} />;
  if (type === 'auto_number') return <AutoNumberPanel {...p} />;
  if (type === 'lookup_value') return <LookupValuePanel {...p} />;
  if (type === 'status_from_rules') return <StatusFromRulesPanel {...p} />;
  if (type === 'file' || type === 'image') return <FilePanel {...p} />;
  return null;
}

// ─── Main FieldEditor ─────────────────────────────────────────────────────────

export type FieldEditorMode = 'create' | 'edit';

export interface FieldEditorProps {
  open: boolean;
  onClose: () => void;
  mode: FieldEditorMode;
  initialField?: Partial<FieldDef>;
  onSave: (field: Omit<FieldDef, 'id' | 'tableId' | 'createdAt' | 'updatedAt'>) => Promise<void>;
}

interface FormState {
  name: string;
  apiKey: string;
  apiKeyTouched: boolean;
  type: FieldType;
  description: string;
  required: boolean;
  unique: boolean;
  defaultValue: string;
  lockWhen: string;
  options: Record<string, unknown>;
  visibilityRule: Partial<VisibilityRule>;
}

function initState(initial?: Partial<FieldDef>): FormState {
  return {
    name: initial?.name ?? '',
    apiKey: initial?.apiKey ?? '',
    apiKeyTouched: Boolean(initial?.apiKey),
    type: initial?.type ?? 'text',
    description: initial?.hint ?? '',
    required: Boolean(initial?.required),
    unique: Boolean(initial?.unique),
    defaultValue: initial?.defaultValue !== undefined ? String(initial.defaultValue) : '',
    lockWhen: initial?.lockWhen ?? '',
    options: (initial?.options as Record<string, unknown>) ?? {},
    visibilityRule: {},
  };
}

export function FieldEditor({ open, onClose, mode, initialField, onSave }: FieldEditorProps) {
  const [state, setState] = React.useState<FormState>(() => initState(initialField));
  const [step, setStep] = React.useState<'type' | 'config'>(mode === 'edit' ? 'config' : 'type');
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState('');

  // State is reset via key prop on the parent when open/initialField changes

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setState((s) => ({ ...s, [key]: value }));
  }

  function handleNameChange(name: string) {
    setState((s) => ({
      ...s,
      name,
      apiKey: s.apiKeyTouched ? s.apiKey : toApiKey(name),
    }));
  }

  function handleTypeSelect(type: FieldType) {
    setState((s) => ({ ...s, type, options: {} }));
    setStep('config');
  }

  function handleOptionChange(key: string, value: unknown) {
    setState((s) => ({ ...s, options: { ...s.options, [key]: value } }));
  }

  async function handleSave() {
    if (!state.name.trim()) { setError('Name is required'); return; }
    if (!state.apiKey.trim()) { setError('API key is required'); return; }
    setSaving(true);
    setError('');
    try {
      await onSave({
        name: state.name.trim(),
        apiKey: state.apiKey.trim(),
        type: state.type,
        hint: state.description || undefined,
        required: state.required,
        unique: state.unique,
        defaultValue: state.defaultValue || undefined,
        lockWhen: state.lockWhen || undefined,
        options: Object.keys(state.options).length > 0 ? state.options as never : undefined,
        rank: initialField?.rank ?? 0,
      });
      onClose();
    } catch (err) {
      setError((err as Error).message ?? 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={mode === 'edit' ? `Edit: ${state.name || 'Field'}` : 'Add Field'}
      side="right"
      size="lg"
    >
      <div className="flex flex-col h-full" data-testid="field-editor">
        {/* Step indicator */}
        {mode === 'create' && (
          <div className="flex gap-2 px-4 pb-4 border-b border-[var(--color-border)]">
            <button
              type="button"
              onClick={() => setStep('type')}
              className={cn(
                'text-xs px-3 py-1 rounded-full border transition-colors',
                step === 'type'
                  ? 'bg-[var(--color-primary)] text-white border-[var(--color-primary)]'
                  : 'border-[var(--color-border)] text-[var(--color-fg-muted)]'
              )}
            >
              1. Type
            </button>
            <button
              type="button"
              onClick={() => { if (state.type) setStep('config'); }}
              className={cn(
                'text-xs px-3 py-1 rounded-full border transition-colors',
                step === 'config'
                  ? 'bg-[var(--color-primary)] text-white border-[var(--color-primary)]'
                  : 'border-[var(--color-border)] text-[var(--color-fg-muted)]'
              )}
            >
              2. Configure
            </button>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          {step === 'type' ? (
            <FieldTypePicker value={state.type} onChange={handleTypeSelect} />
          ) : (
            <>
              {/* Current type badge */}
              <div className="flex items-center gap-2">
                <Badge variant="neutral">{state.type}</Badge>
                {mode === 'create' && (
                  <button
                    type="button"
                    onClick={() => setStep('type')}
                    className="text-xs text-[var(--color-primary)] hover:underline"
                  >
                    Change type
                  </button>
                )}
              </div>

              {/* Common settings */}
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-[var(--color-fg-muted)] mb-1">
                    Name <span className="text-[var(--color-danger)]">*</span>
                  </label>
                  <Input
                    value={state.name}
                    onChange={(e: { target: { value: string } }) => handleNameChange(e.target.value)}
                    placeholder="Field name"
                    data-testid="field-name-input"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--color-fg-muted)] mb-1">
                    API Key <span className="text-[var(--color-danger)]">*</span>
                  </label>
                  <Input
                    value={state.apiKey}
                    onChange={(e: { target: { value: string } }) => { set('apiKey', e.target.value); set('apiKeyTouched', true); }}
                    placeholder="snake_case_key"
                    className="font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--color-fg-muted)] mb-1">Description</label>
                  <Textarea
                    value={state.description}
                    onChange={(e: { target: { value: string } }) => set('description', e.target.value)}
                    placeholder="Helpful description for this field"
                    rows={2}
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={state.required}
                      onChange={(v) => set('required', v)}
                      id="field-required"
                    />
                    <label htmlFor="field-required" className="text-sm text-[var(--color-fg-base)]">Required</label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={state.unique}
                      onChange={(v) => set('unique', v)}
                      id="field-unique"
                    />
                    <label htmlFor="field-unique" className="text-sm text-[var(--color-fg-base)]">Unique</label>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-[var(--color-fg-muted)] mb-1">Default Value</label>
                  <Input
                    value={state.defaultValue}
                    onChange={(e: { target: { value: string } }) => set('defaultValue', e.target.value)}
                    placeholder="Literal value or =expression"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-[var(--color-fg-muted)] mb-1">Lock When (expression)</label>
                  <ExpressionEditor
                    value={state.lockWhen}
          fieldHints={[]}
                    onChange={(v) => set('lockWhen', v)}
                    placeholder="e.g. {status} == 'approved'"
                    rows={2}
                  />
                </div>

                {/* Show when (visibility rule) */}
                <div>
                  <label className="block text-xs font-medium text-[var(--color-fg-muted)] mb-1">Show when</label>
                  <div className="flex gap-2 items-center flex-wrap">
                    <Input
                      value={state.visibilityRule.field ?? ''}
                      onChange={(e: { target: { value: string } }) =>
                        setState((s) => ({ ...s, visibilityRule: { ...s.visibilityRule, field: e.target.value || undefined } }))
                      }
                      placeholder="field key"
                      className="w-32 text-sm font-mono"
                    />
                    <select
                      value={state.visibilityRule.operator ?? ''}
                      onChange={(e: { target: { value: string } }) =>
                        setState((s) => ({ ...s, visibilityRule: { ...s.visibilityRule, operator: (e.target.value as VisibilityRule['operator']) || undefined } }))
                      }
                      className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-surface)] px-2 py-1.5 text-sm text-[var(--color-fg-base)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                    >
                      <option value="">— operator —</option>
                      <option value="eq">equals</option>
                      <option value="neq">not equals</option>
                      <option value="empty">is empty</option>
                      <option value="not_empty">is not empty</option>
                    </select>
                    {(state.visibilityRule.operator === 'eq' || state.visibilityRule.operator === 'neq') && (
                      <Input
                        value={String(state.visibilityRule.value ?? '')}
                        onChange={(e: { target: { value: string } }) =>
                          setState((s) => ({ ...s, visibilityRule: { ...s.visibilityRule, value: e.target.value } }))
                        }
                        placeholder="value"
                        className="w-28 text-sm"
                      />
                    )}
                    {(state.visibilityRule.field || state.visibilityRule.operator) && (
                      <button
                        type="button"
                        onClick={() => setState((s) => ({ ...s, visibilityRule: {} }))}
                        className="text-xs text-[var(--color-danger)] hover:opacity-80"
                        aria-label="Clear visibility rule"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                  <p className="mt-1 text-[10px] text-[var(--color-fg-muted)]">
                    Leave blank to always show this field.
                  </p>
                </div>
              </div>

              {/* Type-specific settings */}
              {HAS_TYPE_PANEL.has(state.type) && (
                <>
                  <hr className="border-[var(--color-border)]" />
                  <div>
                    <p className="text-xs font-semibold text-[var(--color-fg-muted)] uppercase tracking-wider mb-3">
                      Type Settings
                    </p>
                    <TypePanelRenderer type={state.type} options={state.options} onChange={handleOptionChange} />
                  </div>
                </>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        {step === 'config' && (
          <div className="border-t border-[var(--color-border)] p-4 space-y-2">
            {error && <p className="text-xs text-[var(--color-danger)]" role="alert">{error}</p>}
            <div className="flex gap-2 justify-end">
              <Button variant="secondary" onClick={onClose} type="button" disabled={saving}>Cancel</Button>
              <Button onClick={handleSave} loading={saving} type="button">
                {mode === 'edit' ? 'Save Changes' : 'Add Field'}
              </Button>
            </div>
          </div>
        )}
      </div>
    </Drawer>
  );
}
