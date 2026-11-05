'use client';

import * as React from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface SelectOption {
  value: string | number;
  label: string;
  disabled?: boolean;
}

export interface SelectProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'children'> {
  label?: string;
  error?: string;
  hint?: string;
  options: SelectOption[];
  placeholder?: string;
  wrapperClassName?: string;
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, error, hint, options, placeholder, className, wrapperClassName, id, ...props }, ref) => {
    const generatedId = React.useId();
    const inputId = id ?? generatedId;
    const errorId = `${inputId}-error`;

    return (
      <div className={cn('space-y-1', wrapperClassName)}>
        {label && (
          <label htmlFor={inputId} className="block text-sm font-medium text-[var(--color-fg-base)]">
            {label}
            {props.required && (
              <span className="ml-1 text-[var(--color-danger)]" aria-hidden="true">*</span>
            )}
          </label>
        )}
        <div className="relative">
          <select
            ref={ref}
            id={inputId}
            aria-invalid={error ? 'true' : undefined}
            aria-describedby={error ? errorId : undefined}
            className={cn(
              'w-full appearance-none rounded-[var(--radius-md)] border px-3 py-2 pr-8 text-sm bg-[var(--color-bg-base)] text-[var(--color-fg-base)]',
              'transition-colors focus:outline-none focus:ring-2 focus:border-[var(--color-primary)]',
              error
                ? 'border-[var(--color-danger)] focus:ring-[var(--color-danger)]'
                : 'border-[var(--color-border)] focus:ring-[var(--color-primary)]',
              props.disabled && 'opacity-50 cursor-not-allowed bg-[var(--color-bg-muted)]',
              className
            )}
            {...props}
          >
            {placeholder && (
              <option value="" disabled>
                {placeholder}
              </option>
            )}
            {options.map((opt) => (
              <option key={opt.value} value={opt.value} disabled={opt.disabled}>
                {opt.label}
              </option>
            ))}
          </select>
          <ChevronDown
            size={14}
            className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[var(--color-fg-muted)]"
          />
        </div>
        {error && (
          <p id={errorId} role="alert" className="text-xs text-[var(--color-danger)]">
            {error}
          </p>
        )}
        {hint && !error && (
          <p className="text-xs text-[var(--color-fg-muted)]">{hint}</p>
        )}
      </div>
    );
  }
);
Select.displayName = 'Select';
