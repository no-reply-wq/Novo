'use client';

import * as React from 'react';
import { ChevronDown, X } from 'lucide-react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';

export interface MultiSelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface MultiSelectProps {
  options: MultiSelectOption[];
  value?: string[];
  defaultValue?: string[];
  onChange?: (values: string[]) => void;
  label?: string;
  placeholder?: string;
  error?: string;
  hint?: string;
  disabled?: boolean;
  max?: number;
  wrapperClassName?: string;
}

export function MultiSelect({
  options,
  value: controlledValue,
  defaultValue = [],
  onChange,
  label,
  placeholder = 'Select…',
  error,
  hint,
  disabled,
  max,
  wrapperClassName,
}: MultiSelectProps) {
  const [internalValue, setInternalValue] = React.useState<string[]>(defaultValue);
  const [open, setOpen] = React.useState(false);
  const [dropCoords, setDropCoords] = React.useState({ top: 0, left: 0, width: 0 });
  const wrapperRef = React.useRef<HTMLDivElement>(null);
  const generatedId = React.useId();
  const errorId = `${generatedId}-error`;

  const selected = controlledValue ?? internalValue;

  const toggle = (val: string) => {
    const next = selected.includes(val)
      ? selected.filter((v) => v !== val)
      : max && selected.length >= max
        ? selected
        : [...selected, val];
    if (!controlledValue) setInternalValue(next);
    onChange?.(next);
  };

  const remove = (val: string, e: React.MouseEvent) => {
    e.stopPropagation();
    toggle(val);
  };

  const handleOpen = () => {
    if (disabled) return;
    const el = wrapperRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setDropCoords({ top: rect.bottom + window.scrollY + 4, left: rect.left + window.scrollX, width: rect.width });
    setOpen((o) => !o);
  };

  React.useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!wrapperRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const selectedLabels = options.filter((o) => selected.includes(o.value));

  return (
    <div className={cn('space-y-1', wrapperClassName)} ref={wrapperRef}>
      {label && (
        <span className="block text-sm font-medium text-[var(--color-fg-base)]">{label}</span>
      )}
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-describedby={error ? errorId : undefined}
        onClick={handleOpen}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleOpen(); } }}
        className={cn(
          'flex flex-wrap items-center gap-1.5 min-h-[38px] rounded-[var(--radius-md)] border px-3 py-1.5 cursor-pointer transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]',
          error ? 'border-[var(--color-danger)]' : 'border-[var(--color-border)]',
          disabled && 'opacity-50 cursor-not-allowed',
          open && 'ring-2 ring-[var(--color-primary)] border-[var(--color-primary)]'
        )}
      >
        {selectedLabels.length === 0 && (
          <span className="text-sm text-[var(--color-fg-muted)]">{placeholder}</span>
        )}
        {selectedLabels.map((opt) => (
          <span
            key={opt.value}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-[var(--radius-sm)] text-xs font-medium bg-[var(--color-primary)] text-[var(--color-primary-fg)]"
          >
            {opt.label}
            {!disabled && (
              <button
                type="button"
                onClick={(e) => remove(opt.value, e)}
                aria-label={`Remove ${opt.label}`}
                className="hover:opacity-70"
              >
                <X size={10} />
              </button>
            )}
          </span>
        ))}
        <ChevronDown
          size={14}
          className={cn('ml-auto text-[var(--color-fg-muted)] transition-transform flex-shrink-0', open && 'rotate-180')}
        />
      </div>

      {error && <p id={errorId} role="alert" className="text-xs text-[var(--color-danger)]">{error}</p>}
      {hint && !error && <p className="text-xs text-[var(--color-fg-muted)]">{hint}</p>}

      {open && typeof document !== 'undefined' && createPortal(
        <ul
          role="listbox"
          aria-multiselectable="true"
          style={{ position: 'absolute', top: dropCoords.top, left: dropCoords.left, width: dropCoords.width, zIndex: 9000 }}
          className="max-h-56 overflow-y-auto rounded-[var(--radius-lg)] bg-[var(--color-bg-surface)] border border-[var(--color-border)] shadow-[var(--shadow-lg)] py-1"
        >
          {options.map((opt) => {
            const isSelected = selected.includes(opt.value);
            return (
              <li
                key={opt.value}
                role="option"
                aria-selected={isSelected}
                onClick={() => !opt.disabled && toggle(opt.value)}
                className={cn(
                  'flex items-center gap-2.5 px-3 py-1.5 text-sm cursor-pointer transition-colors',
                  opt.disabled ? 'opacity-40 cursor-not-allowed' : 'hover:bg-[var(--color-bg-muted)]'
                )}
              >
                <span
                  className={cn(
                    'w-4 h-4 flex-shrink-0 rounded border flex items-center justify-center',
                    isSelected
                      ? 'bg-[var(--color-primary)] border-[var(--color-primary)]'
                      : 'border-[var(--color-border)]'
                  )}
                >
                  {isSelected && (
                    <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 12 12">
                      <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </span>
                <span className="text-[var(--color-fg-base)]">{opt.label}</span>
              </li>
            );
          })}
        </ul>,
        document.body
      )}
    </div>
  );
}
