'use client';

import * as React from 'react';
import { ChevronDown, X, Search } from 'lucide-react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';

export interface ComboboxOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface ComboboxProps {
  options: ComboboxOption[];
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  onSearch?: (query: string) => void | Promise<void>;
  label?: string;
  placeholder?: string;
  error?: string;
  hint?: string;
  disabled?: boolean;
  clearable?: boolean;
  loading?: boolean;
  wrapperClassName?: string;
  className?: string;
}

export function Combobox({
  options,
  value: controlledValue,
  defaultValue = '',
  onChange,
  onSearch,
  label,
  placeholder = 'Search…',
  error,
  hint,
  disabled,
  clearable = true,
  loading = false,
  wrapperClassName,
  className,
}: ComboboxProps) {
  const [internalValue, setInternalValue] = React.useState(defaultValue);
  const [query, setQuery] = React.useState('');
  const [open, setOpen] = React.useState(false);
  const [activeIndex, setActiveIndex] = React.useState(0);
  const [dropCoords, setDropCoords] = React.useState({ top: 0, left: 0, width: 0 });
  const wrapperRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const listRef = React.useRef<HTMLUListElement>(null);
  const generatedId = React.useId();
  const listId = `${generatedId}-list`;
  const errorId = `${generatedId}-error`;

  const value = controlledValue ?? internalValue;

  const filtered = query
    ? options.filter((o) => o.label.toLowerCase().includes(query.toLowerCase()))
    : options;

  const selectedLabel = options.find((o) => o.value === value)?.label ?? '';

  const selectOption = (opt: ComboboxOption) => {
    if (opt.disabled) return;
    if (!controlledValue) setInternalValue(opt.value);
    onChange?.(opt.value);
    setOpen(false);
    setQuery('');
    inputRef.current?.blur();
  };

  const handleOpen = () => {
    if (disabled) return;
    const el = wrapperRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setDropCoords({
      top: rect.bottom + window.scrollY + 4,
      left: rect.left + window.scrollX,
      width: rect.width,
    });
    setOpen(true);
    setActiveIndex(0);
  };

  React.useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!wrapperRef.current?.contains(e.target as Node) &&
          !(e.target as Element)?.closest(`#${listId.replace(/:/g, '\\:')}`)) {
        setOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'Enter') handleOpen();
      return;
    }
    if (e.key === 'Escape') { setOpen(false); setQuery(''); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIndex((i) => Math.min(i + 1, filtered.length - 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIndex((i) => Math.max(i - 1, 0)); }
    if (e.key === 'Enter' && filtered[activeIndex]) { selectOption(filtered[activeIndex]); }
  };

  const handleQueryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(e.target.value);
    setActiveIndex(0);
    onSearch?.(e.target.value);
    if (!open) handleOpen();
  };

  return (
    <div className={cn('space-y-1', wrapperClassName)} ref={wrapperRef}>
      {label && (
        <label className="block text-sm font-medium text-[var(--color-fg-base)]">{label}</label>
      )}
      <div
        className={cn(
          'flex items-center rounded-[var(--radius-md)] border bg-[var(--color-bg-base)] transition-colors',
          error
            ? 'border-[var(--color-danger)]'
            : 'border-[var(--color-border)] focus-within:ring-2 focus-within:ring-[var(--color-primary)] focus-within:border-[var(--color-primary)]',
          disabled && 'opacity-50 cursor-not-allowed',
          className
        )}
      >
        <Search size={14} className="ml-3 text-[var(--color-fg-muted)] flex-shrink-0" />
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={open ? listId : undefined}
          aria-describedby={error ? errorId : undefined}
          aria-activedescendant={open && filtered[activeIndex] ? `${listId}-${activeIndex}` : undefined}
          disabled={disabled}
          placeholder={open ? placeholder : (selectedLabel || placeholder)}
          value={open ? query : (selectedLabel || query)}
          onChange={handleQueryChange}
          onFocus={handleOpen}
          onKeyDown={handleKeyDown}
          className="flex-1 min-w-0 px-2 py-2 text-sm bg-transparent text-[var(--color-fg-base)] placeholder:text-[var(--color-fg-muted)] focus:outline-none disabled:cursor-not-allowed"
        />
        {clearable && value && !disabled && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (!controlledValue) setInternalValue('');
              onChange?.('');
              setQuery('');
            }}
            className="p-1.5 text-[var(--color-fg-muted)] hover:text-[var(--color-fg-base)]"
            aria-label="Clear selection"
          >
            <X size={12} />
          </button>
        )}
        <ChevronDown
          size={14}
          className={cn('mr-3 text-[var(--color-fg-muted)] transition-transform', open && 'rotate-180')}
        />
      </div>

      {error && <p id={errorId} role="alert" className="text-xs text-[var(--color-danger)]">{error}</p>}
      {hint && !error && <p className="text-xs text-[var(--color-fg-muted)]">{hint}</p>}

      {open && typeof document !== 'undefined' && createPortal(
        <ul
          id={listId}
          ref={listRef}
          role="listbox"
          style={{
            position: 'absolute',
            top: dropCoords.top,
            left: dropCoords.left,
            width: dropCoords.width,
            zIndex: 9000,
          }}
          className="max-h-56 overflow-y-auto rounded-[var(--radius-lg)] bg-[var(--color-bg-surface)] border border-[var(--color-border)] shadow-[var(--shadow-lg)] py-1"
        >
          {loading && (
            <li className="px-3 py-2 text-sm text-[var(--color-fg-muted)]">Loading…</li>
          )}
          {!loading && filtered.length === 0 && (
            <li className="px-3 py-2 text-sm text-[var(--color-fg-muted)]">No results</li>
          )}
          {!loading && filtered.map((opt, i) => (
            <li
              key={opt.value}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={opt.value === value}
              aria-disabled={opt.disabled}
              onMouseEnter={() => setActiveIndex(i)}
              onClick={() => selectOption(opt)}
              className={cn(
                'px-3 py-1.5 text-sm cursor-pointer transition-colors',
                opt.disabled && 'opacity-40 cursor-not-allowed',
                i === activeIndex && 'bg-[var(--color-bg-muted)]',
                opt.value === value && 'text-[var(--color-primary)] font-medium',
                !opt.disabled && i !== activeIndex && 'text-[var(--color-fg-base)]'
              )}
            >
              {opt.label}
            </li>
          ))}
        </ul>,
        document.body
      )}
    </div>
  );
}
