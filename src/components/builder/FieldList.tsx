'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { FieldDef } from '@/platform/contracts/fields';

// ─── Type icon map ────────────────────────────────────────────────────────────

const TYPE_ICONS: Record<string, string> = {
  text: 'T', long_text: '¶', rich_text: 'R', email: '@', phone: '#', url: '🔗', password: '🔒',
  integer: '1', decimal: '1.2', currency: '₹', percent: '%', quantity: 'Q',
  date: '📅', time: '⏰', datetime: '📆', date_range: '↔', duration: '⏱',
  dropdown: '▼', multi_select: '☰', radio: '◉', checkbox: '☑', boolean: '⊙', rating: '★', color: '🎨',
  lookup: '→', user: '👤', location: '📍',
  file: '📎', image: '🖼', signature: '✍', barcode: '▦', gps: '🛰', json: '{}',
  formula: 'fx', rollup: 'Σ', lookup_value: '◈', auto_number: '##', status_from_rules: '⚙',
};

function typeIcon(type: string): string {
  return TYPE_ICONS[type] ?? '?';
}

// ─── Drag-to-reorder (native HTML5 DnD) ──────────────────────────────────────

interface FieldRowProps {
  field: FieldDef;
  index: number;
  onEdit: (field: FieldDef) => void;
  onDelete: (field: FieldDef) => void;
  onDragStart: (index: number) => void;
  onDragOver: (index: number) => void;
  onDrop: () => void;
  isDragging: boolean;
  isOver: boolean;
}

function FieldRow({
  field,
  onEdit,
  onDelete,
  onDragStart,
  onDragOver,
  onDrop,
  index,
  isDragging,
  isOver,
}: FieldRowProps) {
  const formulaPreview =
    field.type === 'formula' && field.options
      ? String((field.options as Record<string, unknown>).expression ?? '').slice(0, 40)
      : null;

  return (
    <div
      draggable
      onDragStart={() => onDragStart(index)}
      onDragOver={(e) => { e.preventDefault(); onDragOver(index); }}
      onDrop={onDrop}
      className={cn(
        'group flex items-center gap-3 px-4 py-3 border border-[var(--color-border)] rounded-[var(--radius-md)] bg-[var(--color-bg-surface)] transition-all',
        isDragging && 'opacity-40',
        isOver && 'border-[var(--color-primary)] ring-1 ring-[var(--color-primary)]'
      )}
      data-testid="field-row"
    >
      {/* Drag handle */}
      <span
        className="text-[var(--color-fg-muted)] cursor-grab group-hover:text-[var(--color-fg-base)] select-none"
        aria-label="Drag to reorder"
        data-testid="drag-handle"
      >
        ⠿
      </span>

      {/* Type icon */}
      <span
        className="w-7 h-7 flex items-center justify-center rounded bg-[var(--color-bg-muted)] text-sm font-mono flex-shrink-0"
        aria-label={`Type: ${field.type}`}
      >
        {typeIcon(field.type)}
      </span>

      {/* Name + apiKey */}
      <div className="flex-1 min-w-0">
        <span className="font-medium text-sm text-[var(--color-fg-base)]">{field.name}</span>
        <span className="ml-2 text-xs text-[var(--color-fg-muted)] font-mono">{field.apiKey}</span>
        {formulaPreview && (
          <p className="text-xs text-[var(--color-fg-muted)] mt-0.5 truncate font-mono">={formulaPreview}</p>
        )}
      </div>

      {/* Badges */}
      <div className="flex items-center gap-1 flex-shrink-0">
        <Badge variant="neutral" className="text-[10px] px-1.5 py-0.5">{field.type}</Badge>
        {field.required && <Badge variant="neutral" className="text-[10px] px-1.5 py-0.5 text-[var(--color-warning)]">required</Badge>}
        {field.unique && <Badge variant="neutral" className="text-[10px] px-1.5 py-0.5 text-[var(--color-info)]">unique</Badge>}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          type="button"
          onClick={() => onEdit(field)}
          className="p-1.5 rounded hover:bg-[var(--color-bg-muted)] text-[var(--color-fg-muted)] hover:text-[var(--color-fg-base)] text-xs"
          aria-label={`Edit ${field.name}`}
        >
          ✎
        </button>
        <button
          type="button"
          onClick={() => onDelete(field)}
          className="p-1.5 rounded hover:bg-[var(--color-danger)] hover:bg-opacity-10 text-[var(--color-fg-muted)] hover:text-[var(--color-danger)] text-xs"
          aria-label={`Delete ${field.name}`}
        >
          ✕
        </button>
      </div>
    </div>
  );
}

// ─── FieldList ────────────────────────────────────────────────────────────────

export interface FieldListProps {
  fields: FieldDef[];
  onEdit: (field: FieldDef) => void;
  onDelete: (field: FieldDef) => void;
  onReorder: (fields: FieldDef[]) => void;
  onAddField: () => void;
}

export function FieldList({ fields, onEdit, onDelete, onReorder, onAddField }: FieldListProps) {
  const [draggingIdx, setDraggingIdx] = React.useState<number | null>(null);
  const [overIdx, setOverIdx] = React.useState<number | null>(null);

  function handleDrop() {
    if (draggingIdx === null || overIdx === null || draggingIdx === overIdx) {
      setDraggingIdx(null);
      setOverIdx(null);
      return;
    }
    const reordered = [...fields];
    const [moved] = reordered.splice(draggingIdx, 1);
    reordered.splice(overIdx, 0, moved);
    onReorder(reordered.map((f, i) => ({ ...f, rank: i })));
    setDraggingIdx(null);
    setOverIdx(null);
  }

  if (fields.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4 py-16 text-center" data-testid="field-list">
        <p className="text-[var(--color-fg-muted)] text-sm">No fields yet. Add your first field below.</p>
        <Button onClick={onAddField} type="button">+ Add Field</Button>
      </div>
    );
  }

  return (
    <div className="space-y-2" data-testid="field-list">
      {fields.map((field, idx) => (
        <FieldRow
          key={field.id}
          field={field}
          index={idx}
          onEdit={onEdit}
          onDelete={onDelete}
          onDragStart={setDraggingIdx}
          onDragOver={setOverIdx}
          onDrop={handleDrop}
          isDragging={draggingIdx === idx}
          isOver={overIdx === idx && draggingIdx !== idx}
        />
      ))}
      <div className="pt-2">
        <Button variant="secondary" onClick={onAddField} type="button" className="w-full">
          + Add Field
        </Button>
      </div>
    </div>
  );
}
