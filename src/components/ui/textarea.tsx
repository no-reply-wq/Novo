'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  hint?: string;
  autoResize?: boolean;
  wrapperClassName?: string;
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, error, hint, autoResize = false, className, wrapperClassName, id, ...props }, ref) => {
    const generatedId = React.useId();
    const inputId = id ?? generatedId;
    const errorId = `${inputId}-error`;
    const internalRef = React.useRef<HTMLTextAreaElement>(null);

    const combinedRef = (node: HTMLTextAreaElement | null) => {
      (internalRef as React.MutableRefObject<HTMLTextAreaElement | null>).current = node;
      if (typeof ref === 'function') ref(node);
      else if (ref) (ref as React.MutableRefObject<HTMLTextAreaElement | null>).current = node;
    };

    const handleInput = () => {
      if (!autoResize) return;
      const el = internalRef.current;
      if (!el) return;
      el.style.height = 'auto';
      el.style.height = `${el.scrollHeight}px`;
    };

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
        <textarea
          ref={combinedRef}
          id={inputId}
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={error ? errorId : undefined}
          rows={props.rows ?? 3}
          onInput={handleInput}
          className={cn(
            'block w-full rounded-[var(--radius-md)] border px-3 py-2 text-sm bg-[var(--color-bg-base)] text-[var(--color-fg-base)]',
            'placeholder:text-[var(--color-fg-muted)] transition-colors',
            'focus:outline-none focus:ring-2 focus:border-[var(--color-primary)]',
            autoResize ? 'resize-none overflow-hidden' : 'resize-y',
            error
              ? 'border-[var(--color-danger)] focus:ring-[var(--color-danger)]'
              : 'border-[var(--color-border)] focus:ring-[var(--color-primary)]',
            props.disabled && 'opacity-50 cursor-not-allowed bg-[var(--color-bg-muted)]',
            className
          )}
          {...props}
        />
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
Textarea.displayName = 'Textarea';
