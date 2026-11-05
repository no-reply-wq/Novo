'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

export interface RadioOption {
  value: string;
  label: React.ReactNode;
  disabled?: boolean;
  description?: string;
}

export interface RadioGroupProps {
  options: RadioOption[];
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  name?: string;
  label?: string;
  error?: string;
  orientation?: 'vertical' | 'horizontal';
  className?: string;
}

export function RadioGroup({
  options,
  value: controlledValue,
  defaultValue = '',
  onChange,
  name,
  label,
  error,
  orientation = 'vertical',
  className,
}: RadioGroupProps) {
  const [internalValue, setInternalValue] = React.useState(defaultValue);
  const generatedId = React.useId();
  const groupName = name ?? generatedId;
  const errorId = `${generatedId}-error`;

  const value = controlledValue ?? internalValue;

  const handleChange = (val: string) => {
    if (!controlledValue) setInternalValue(val);
    onChange?.(val);
  };

  return (
    <fieldset className={cn('space-y-2', className)}>
      {label && (
        <legend className="block text-sm font-medium text-[var(--color-fg-base)] mb-2">
          {label}
        </legend>
      )}
      <div
        role="radiogroup"
        aria-describedby={error ? errorId : undefined}
        className={cn(
          'flex gap-3',
          orientation === 'vertical' && 'flex-col',
          orientation === 'horizontal' && 'flex-row flex-wrap'
        )}
      >
        {options.map((opt) => {
          const optId = `${groupName}-${opt.value}`;
          const isChecked = value === opt.value;
          return (
            <label
              key={opt.value}
              htmlFor={optId}
              className={cn(
                'inline-flex items-start gap-2.5 cursor-pointer',
                opt.disabled && 'opacity-50 cursor-not-allowed'
              )}
            >
              <div className="relative mt-0.5 flex-shrink-0">
                <input
                  id={optId}
                  type="radio"
                  name={groupName}
                  value={opt.value}
                  checked={isChecked}
                  disabled={opt.disabled}
                  onChange={() => handleChange(opt.value)}
                  className="sr-only peer"
                />
                <div
                  className={cn(
                    'w-4 h-4 rounded-full border flex items-center justify-center transition-colors',
                    'peer-focus-visible:ring-2 peer-focus-visible:ring-[var(--color-primary)] peer-focus-visible:ring-offset-1',
                    isChecked
                      ? 'border-[var(--color-primary)]'
                      : 'border-[var(--color-border)] bg-[var(--color-bg-base)]',
                    error && 'border-[var(--color-danger)]'
                  )}
                >
                  {isChecked && (
                    <span className="w-2 h-2 rounded-full bg-[var(--color-primary)] block" />
                  )}
                </div>
              </div>
              <span>
                <span className="block text-sm text-[var(--color-fg-base)]">{opt.label}</span>
                {opt.description && (
                  <span className="block text-xs text-[var(--color-fg-muted)] mt-0.5">
                    {opt.description}
                  </span>
                )}
              </span>
            </label>
          );
        })}
      </div>
      {error && (
        <p id={errorId} role="alert" className="text-xs text-[var(--color-danger)]">
          {error}
        </p>
      )}
    </fieldset>
  );
}
