'use client';

import * as React from 'react';
import { Check, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'onChange'> {
  label?: React.ReactNode;
  indeterminate?: boolean;
  error?: string;
  onChange?: (checked: boolean) => void;
}

export const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ label, indeterminate = false, error, onChange, className, id, ...props }, ref) => {
    const generatedId = React.useId();
    const inputId = id ?? generatedId;
    const errorId = `${inputId}-error`;
    const internalRef = React.useRef<HTMLInputElement>(null);

    const combinedRef = (node: HTMLInputElement | null) => {
      (internalRef as React.MutableRefObject<HTMLInputElement | null>).current = node;
      if (typeof ref === 'function') ref(node);
      else if (ref) (ref as React.MutableRefObject<HTMLInputElement | null>).current = node;
    };

    React.useEffect(() => {
      if (internalRef.current) {
        internalRef.current.indeterminate = indeterminate;
      }
    }, [indeterminate]);

    const isChecked = props.checked;
    const isIndeterminate = indeterminate;

    return (
      <div className="space-y-1">
        <label
          htmlFor={inputId}
          className={cn(
            'inline-flex items-start gap-2.5 cursor-pointer',
            props.disabled && 'opacity-50 cursor-not-allowed'
          )}
        >
          <div className="relative mt-0.5 flex-shrink-0">
            <input
              ref={combinedRef}
              id={inputId}
              type="checkbox"
              aria-describedby={error ? errorId : undefined}
              onChange={(e) => onChange?.(e.target.checked)}
              className="sr-only peer"
              {...props}
            />
            <div
              className={cn(
                'w-4 h-4 rounded-[var(--radius-sm)] border flex items-center justify-center transition-colors',
                'peer-focus-visible:ring-2 peer-focus-visible:ring-[var(--color-primary)] peer-focus-visible:ring-offset-1',
                (isChecked || isIndeterminate)
                  ? 'bg-[var(--color-primary)] border-[var(--color-primary)]'
                  : 'bg-[var(--color-bg-base)] border-[var(--color-border)]',
                error && 'border-[var(--color-danger)]',
                className
              )}
            >
              {isIndeterminate ? (
                <Minus size={10} className="text-white" />
              ) : isChecked ? (
                <Check size={10} className="text-white" />
              ) : null}
            </div>
          </div>
          {label && (
            <span className="text-sm text-[var(--color-fg-base)] leading-5">{label}</span>
          )}
        </label>
        {error && (
          <p id={errorId} role="alert" className="text-xs text-[var(--color-danger)] ml-6.5">
            {error}
          </p>
        )}
      </div>
    );
  }
);
Checkbox.displayName = 'Checkbox';
