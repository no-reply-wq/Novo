'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

export interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'prefix'> {
  label?: string;
  error?: string;
  hint?: string;
  prefix?: React.ReactNode;
  suffix?: React.ReactNode;
  wrapperClassName?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, prefix, suffix, className, wrapperClassName, id, ...props }, ref) => {
    const generatedId = React.useId();
    const inputId = id ?? generatedId;
    const errorId = `${inputId}-error`;
    const hintId = `${inputId}-hint`;

    const describedBy = [
      error ? errorId : null,
      hint && !error ? hintId : null,
    ]
      .filter(Boolean)
      .join(' ') || undefined;

    return (
      <div className={cn('space-y-1', wrapperClassName)}>
        {label && (
          <label
            htmlFor={inputId}
            className="block text-sm font-medium text-[var(--color-fg-base)]"
          >
            {label}
            {props.required && (
              <span className="ml-1 text-[var(--color-danger)]" aria-hidden="true">
                *
              </span>
            )}
          </label>
        )}

        <div
          className={cn(
            'flex items-center rounded-[var(--radius-md)] border bg-[var(--color-bg-base)] transition-colors',
            error
              ? 'border-[var(--color-danger)] focus-within:ring-2 focus-within:ring-[var(--color-danger)]'
              : 'border-[var(--color-border)] focus-within:ring-2 focus-within:ring-[var(--color-primary)] focus-within:border-[var(--color-primary)]',
            props.disabled && 'opacity-50 cursor-not-allowed bg-[var(--color-bg-muted)]'
          )}
        >
          {prefix && (
            <span className="flex items-center pl-3 text-[var(--color-fg-muted)] flex-shrink-0">
              {prefix}
            </span>
          )}
          <input
            ref={ref}
            id={inputId}
            aria-invalid={error ? 'true' : undefined}
            aria-describedby={describedBy}
            className={cn(
              'flex-1 min-w-0 px-3 py-2 text-sm bg-transparent text-[var(--color-fg-base)]',
              'placeholder:text-[var(--color-fg-muted)] focus:outline-none',
              'disabled:cursor-not-allowed',
              prefix && 'pl-2',
              suffix && 'pr-2',
              className
            )}
            {...props}
          />
          {suffix && (
            <span className="flex items-center pr-3 text-[var(--color-fg-muted)] flex-shrink-0">
              {suffix}
            </span>
          )}
        </div>

        {error && (
          <p id={errorId} role="alert" className="text-xs text-[var(--color-danger)]">
            {error}
          </p>
        )}
        {hint && !error && (
          <p id={hintId} className="text-xs text-[var(--color-fg-muted)]">
            {hint}
          </p>
        )}
      </div>
    );
  }
);
Input.displayName = 'Input';
