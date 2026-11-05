'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

export interface SwitchProps {
  checked?: boolean;
  defaultChecked?: boolean;
  onChange?: (checked: boolean) => void;
  label?: React.ReactNode;
  description?: string;
  disabled?: boolean;
  size?: 'sm' | 'md';
  className?: string;
  id?: string;
}

export function Switch({
  checked: controlledChecked,
  defaultChecked = false,
  onChange,
  label,
  description,
  disabled,
  size = 'md',
  className,
  id,
}: SwitchProps) {
  const [internalChecked, setInternalChecked] = React.useState(defaultChecked);
  const generatedId = React.useId();
  const switchId = id ?? generatedId;
  const descId = description ? `${switchId}-desc` : undefined;

  const checked = controlledChecked ?? internalChecked;

  const toggle = () => {
    if (disabled) return;
    if (controlledChecked === undefined) setInternalChecked((c) => !c);
    onChange?.(!checked);
  };

  const trackSize = size === 'sm' ? 'w-8 h-4' : 'w-10 h-5';
  const thumbSize = size === 'sm' ? 'w-3 h-3' : 'w-3.5 h-3.5';
  const thumbTranslate = size === 'sm' ? 'translate-x-4' : 'translate-x-5';

  return (
    <div className={cn('flex items-start gap-3', className)}>
      <button
        id={switchId}
        role="switch"
        aria-checked={checked}
        aria-disabled={disabled}
        aria-describedby={descId}
        onClick={toggle}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } }}
        className={cn(
          'relative inline-flex flex-shrink-0 rounded-full p-0.5 transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] focus-visible:ring-offset-1',
          trackSize,
          checked ? 'bg-[var(--color-primary)]' : 'bg-[var(--color-bg-muted)]',
          disabled && 'opacity-50 cursor-not-allowed'
        )}
      >
        <span
          className={cn(
            'block rounded-full bg-white shadow-[var(--shadow-sm)] transition-transform duration-200',
            thumbSize,
            checked ? thumbTranslate : 'translate-x-0'
          )}
        />
      </button>
      {(label || description) && (
        <label htmlFor={switchId} className={cn('cursor-pointer', disabled && 'cursor-not-allowed')}>
          {label && <span className="block text-sm font-medium text-[var(--color-fg-base)]">{label}</span>}
          {description && (
            <span id={descId} className="block text-xs text-[var(--color-fg-muted)] mt-0.5">
              {description}
            </span>
          )}
        </label>
      )}
    </div>
  );
}
