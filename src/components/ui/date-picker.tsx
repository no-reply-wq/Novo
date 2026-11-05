'use client';

import * as React from 'react';
import { ChevronLeft, ChevronRight, Calendar } from 'lucide-react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';

export interface DatePickerProps {
  value?: Date | null;
  defaultValue?: Date | null;
  onChange?: (date: Date | null) => void;
  label?: string;
  placeholder?: string;
  error?: string;
  hint?: string;
  disabled?: boolean;
  minDate?: Date;
  maxDate?: Date;
  className?: string;
  wrapperClassName?: string;
}

const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];
const DAYS = ['Su','Mo','Tu','We','Th','Fr','Sa'];

function formatDate(d: Date): string {
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function DatePicker({
  value: controlledValue,
  defaultValue = null,
  onChange,
  label,
  placeholder = 'Select date',
  error,
  hint,
  disabled,
  minDate,
  maxDate,
  className,
  wrapperClassName,
}: DatePickerProps) {
  const [internalValue, setInternalValue] = React.useState<Date | null>(defaultValue);
  const [open, setOpen] = React.useState(false);
  const [dropCoords, setDropCoords] = React.useState({ top: 0, left: 0 });
  const [viewDate, setViewDate] = React.useState(() => {
    const v = controlledValue ?? defaultValue;
    return v ? new Date(v.getFullYear(), v.getMonth(), 1) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  });
  const triggerRef = React.useRef<HTMLDivElement>(null);
  const calRef = React.useRef<HTMLDivElement>(null);
  const generatedId = React.useId();
  const errorId = `${generatedId}-error`;

  const value = controlledValue !== undefined ? controlledValue : internalValue;

  const selectDate = (d: Date) => {
    if (!controlledValue) setInternalValue(d);
    onChange?.(d);
    setOpen(false);
  };

  const handleOpen = () => {
    if (disabled) return;
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setDropCoords({ top: rect.bottom + window.scrollY + 4, left: rect.left + window.scrollX });
    setOpen(true);
  };

  React.useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!triggerRef.current?.contains(e.target as Node) && !calRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open]);

  // Build calendar grid
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (Date | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => new Date(year, month, i + 1)),
  ];

  const prevMonth = () => setViewDate(new Date(year, month - 1, 1));
  const nextMonth = () => setViewDate(new Date(year, month + 1, 1));

  const isDisabled = (d: Date) =>
    (minDate && d < new Date(minDate.getFullYear(), minDate.getMonth(), minDate.getDate())) ||
    (maxDate && d > new Date(maxDate.getFullYear(), maxDate.getMonth(), maxDate.getDate()));

  return (
    <div className={cn('space-y-1', wrapperClassName)}>
      {label && (
        <label className="block text-sm font-medium text-[var(--color-fg-base)]">{label}</label>
      )}
      <div
        ref={triggerRef}
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-describedby={error ? errorId : undefined}
        onClick={handleOpen}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleOpen(); } }}
        className={cn(
          'flex items-center gap-2 rounded-[var(--radius-md)] border px-3 py-2 cursor-pointer transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]',
          error ? 'border-[var(--color-danger)]' : 'border-[var(--color-border)]',
          disabled && 'opacity-50 cursor-not-allowed',
          open && 'ring-2 ring-[var(--color-primary)] border-[var(--color-primary)]',
          className
        )}
      >
        <Calendar size={14} className="text-[var(--color-fg-muted)] flex-shrink-0" />
        <span className={cn('text-sm flex-1', value ? 'text-[var(--color-fg-base)]' : 'text-[var(--color-fg-muted)]')}>
          {value ? formatDate(value) : placeholder}
        </span>
      </div>

      {error && <p id={errorId} role="alert" className="text-xs text-[var(--color-danger)]">{error}</p>}
      {hint && !error && <p className="text-xs text-[var(--color-fg-muted)]">{hint}</p>}

      {open && typeof document !== 'undefined' && createPortal(
        <div
          ref={calRef}
          role="dialog"
          aria-label="Date picker calendar"
          style={{ position: 'absolute', top: dropCoords.top, left: dropCoords.left, zIndex: 9000 }}
          className="rounded-[var(--radius-lg)] bg-[var(--color-bg-surface)] border border-[var(--color-border)] shadow-[var(--shadow-lg)] p-4 w-72"
        >
          <div className="flex items-center justify-between mb-4">
            <button
              onClick={prevMonth}
              aria-label="Previous month"
              className="p-1.5 rounded-[var(--radius-sm)] hover:bg-[var(--color-bg-muted)] text-[var(--color-fg-muted)] transition-colors"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="text-sm font-semibold text-[var(--color-fg-base)]">
              {MONTHS[month]} {year}
            </span>
            <button
              onClick={nextMonth}
              aria-label="Next month"
              className="p-1.5 rounded-[var(--radius-sm)] hover:bg-[var(--color-bg-muted)] text-[var(--color-fg-muted)] transition-colors"
            >
              <ChevronRight size={16} />
            </button>
          </div>
          <div className="grid grid-cols-7 gap-y-1">
            {DAYS.map((d) => (
              <span key={d} className="text-center text-xs font-medium text-[var(--color-fg-muted)] py-1">
                {d}
              </span>
            ))}
            {cells.map((date, i) => {
              if (!date) return <span key={`empty-${i}`} />;
              const selected = value && isSameDay(date, value);
              const today = isSameDay(date, new Date());
              const dis = isDisabled(date);
              return (
                <button
                  key={date.toISOString()}
                  disabled={!!dis}
                  onClick={() => !dis && selectDate(date)}
                  aria-label={formatDate(date)}
                  aria-current={today ? 'date' : undefined}
                  aria-pressed={!!selected}
                  className={cn(
                    'w-9 h-9 mx-auto text-xs rounded-full flex items-center justify-center transition-colors',
                    'disabled:opacity-30 disabled:cursor-not-allowed',
                    selected
                      ? 'bg-[var(--color-primary)] text-[var(--color-primary-fg)] font-medium'
                      : today
                        ? 'border border-[var(--color-primary)] text-[var(--color-primary)]'
                        : 'text-[var(--color-fg-base)] hover:bg-[var(--color-bg-muted)]'
                  )}
                >
                  {date.getDate()}
                </button>
              );
            })}
          </div>
          {value && (
            <button
              onClick={() => { if (!controlledValue) setInternalValue(null); onChange?.(null); setOpen(false); }}
              className="mt-3 w-full text-xs text-[var(--color-fg-muted)] hover:text-[var(--color-fg-base)] transition-colors"
            >
              Clear date
            </button>
          )}
        </div>,
        document.body
      )}
    </div>
  );
}
