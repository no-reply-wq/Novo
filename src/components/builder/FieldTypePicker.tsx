'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import type { FieldType } from '@/platform/contracts/fields';

export interface FieldTypeGroup {
  label: string;
  types: Array<{ type: FieldType; label: string; icon: string }>;
}

export const FIELD_TYPE_GROUPS: FieldTypeGroup[] = [
  {
    label: 'Text',
    types: [
      { type: 'text', label: 'Text', icon: 'T' },
      { type: 'long_text', label: 'Long Text', icon: '¶' },
      { type: 'rich_text', label: 'Rich Text', icon: 'R' },
      { type: 'email', label: 'Email', icon: '@' },
      { type: 'phone', label: 'Phone', icon: '#' },
      { type: 'url', label: 'URL', icon: '🔗' },
      { type: 'password', label: 'Password', icon: '🔒' },
    ],
  },
  {
    label: 'Numbers',
    types: [
      { type: 'integer', label: 'Integer', icon: '1' },
      { type: 'decimal', label: 'Decimal', icon: '1.2' },
      { type: 'currency', label: 'Currency', icon: '₹' },
      { type: 'percent', label: 'Percent', icon: '%' },
      { type: 'quantity', label: 'Quantity', icon: 'Q' },
    ],
  },
  {
    label: 'Dates',
    types: [
      { type: 'date', label: 'Date', icon: '📅' },
      { type: 'time', label: 'Time', icon: '⏰' },
      { type: 'datetime', label: 'Date & Time', icon: '📆' },
      { type: 'date_range', label: 'Date Range', icon: '↔' },
      { type: 'duration', label: 'Duration', icon: '⏱' },
    ],
  },
  {
    label: 'Choice',
    types: [
      { type: 'dropdown', label: 'Dropdown', icon: '▼' },
      { type: 'multi_select', label: 'Multi Select', icon: '☰' },
      { type: 'radio', label: 'Radio', icon: '◉' },
      { type: 'checkbox', label: 'Checkbox', icon: '☑' },
      { type: 'boolean', label: 'Boolean', icon: '⊙' },
      { type: 'rating', label: 'Rating', icon: '★' },
      { type: 'color', label: 'Color', icon: '🎨' },
    ],
  },
  {
    label: 'Links',
    types: [
      { type: 'lookup', label: 'Lookup', icon: '→' },
      { type: 'user', label: 'User', icon: '👤' },
      { type: 'location', label: 'Location', icon: '📍' },
    ],
  },
  {
    label: 'Files',
    types: [
      { type: 'file', label: 'File', icon: '📎' },
      { type: 'image', label: 'Image', icon: '🖼' },
      { type: 'signature', label: 'Signature', icon: '✍' },
      { type: 'barcode', label: 'Barcode', icon: '▦' },
      { type: 'gps', label: 'GPS', icon: '🛰' },
      { type: 'json', label: 'JSON', icon: '{}' },
    ],
  },
  {
    label: 'Computed',
    types: [
      { type: 'formula', label: 'Formula', icon: 'fx' },
      { type: 'rollup', label: 'Rollup', icon: 'Σ' },
      { type: 'lookup_value', label: 'Lookup Value', icon: '◈' },
      { type: 'auto_number', label: 'Auto Number', icon: '##' },
      { type: 'status_from_rules', label: 'Status from Rules', icon: '⚙' },
    ],
  },
];

export interface FieldTypePickerProps {
  value?: FieldType;
  onChange: (type: FieldType) => void;
  className?: string;
}

export function FieldTypePicker({ value, onChange, className }: FieldTypePickerProps) {
  return (
    <div className={cn('space-y-4', className)} data-testid="field-type-picker">
      {FIELD_TYPE_GROUPS.map((group) => (
        <div key={group.label}>
          <p className="text-xs font-semibold text-[var(--color-fg-muted)] uppercase tracking-wider mb-2">
            {group.label}
          </p>
          <div className="grid grid-cols-3 gap-1">
            {group.types.map(({ type, label, icon }) => (
              <button
                key={type}
                type="button"
                data-type={type}
                onClick={() => onChange(type)}
                className={cn(
                  'flex flex-col items-center gap-1 p-2 rounded-[var(--radius-md)] border text-xs transition-colors',
                  'hover:bg-[var(--color-bg-muted)] hover:border-[var(--color-primary)]',
                  value === type
                    ? 'bg-[var(--color-primary)] bg-opacity-10 border-[var(--color-primary)] text-[var(--color-primary)] font-medium'
                    : 'border-[var(--color-border)] text-[var(--color-fg-base)]'
                )}
                aria-pressed={value === type}
              >
                <span className="text-base leading-none" aria-hidden="true">{icon}</span>
                <span>{label}</span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
