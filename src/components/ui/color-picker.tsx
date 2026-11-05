'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

const SWATCHES = [
  '#ef4444','#f97316','#eab308','#22c55e',
  '#14b8a6','#3b82f6','#8b5cf6','#ec4899',
  '#000000','#374151','#6b7280','#d1d5db',
  '#ffffff','#fef3c7','#dbeafe','#f3e8ff',
];

export interface ColorPickerProps {
  value?: string;
  defaultValue?: string;
  onChange?: (color: string) => void;
  label?: string;
  error?: string;
  swatches?: string[];
  disabled?: boolean;
  className?: string;
}

function isValidHex(val: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(val);
}

export function ColorPicker({
  value: controlledValue,
  defaultValue = '#000000',
  onChange,
  label,
  error,
  swatches = SWATCHES,
  disabled,
  className,
}: ColorPickerProps) {
  const [internalValue, setInternalValue] = React.useState(defaultValue);
  // draftInput tracks what the user is typing; resets to committed value on blur/valid hex
  const [draftInput, setDraftInput] = React.useState<string | null>(null);
  const id = React.useId();
  const errorId = `${id}-error`;

  const value = controlledValue ?? internalValue;
  // Show draft while typing, fall back to committed value
  const inputVal = draftInput ?? value;

  const set = (color: string) => {
    if (!controlledValue) setInternalValue(color);
    onChange?.(color);
    setDraftInput(null);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setDraftInput(val);
    if (isValidHex(val)) set(val);
  };

  const handleInputBlur = () => {
    if (!isValidHex(inputVal)) setDraftInput(null); // reset draft to committed value
  };

  return (
    <div className={cn('space-y-2', className)}>
      {label && (
        <label htmlFor={`${id}-hex`} className="block text-sm font-medium text-[var(--color-fg-base)]">
          {label}
        </label>
      )}
      <div
        className={cn(
          'flex items-center gap-2 rounded-[var(--radius-md)] border p-2 bg-[var(--color-bg-base)]',
          error ? 'border-[var(--color-danger)]' : 'border-[var(--color-border)]'
        )}
      >
        {/* Native color input */}
        <input
          type="color"
          value={value}
          disabled={disabled}
          onChange={(e) => set(e.target.value)}
          className="w-8 h-8 rounded cursor-pointer border-0 bg-transparent p-0"
          aria-label="Pick color"
          title="Pick color"
        />
        {/* Hex input */}
        <input
          id={`${id}-hex`}
          type="text"
          value={inputVal}
          disabled={disabled}
          onChange={handleInputChange}
          onBlur={handleInputBlur}
          aria-describedby={error ? errorId : undefined}
          maxLength={7}
          className="flex-1 min-w-0 text-sm bg-transparent text-[var(--color-fg-base)] font-mono focus:outline-none disabled:cursor-not-allowed"
          placeholder="#000000"
        />
        <div
          className="w-6 h-6 rounded-full border border-[var(--color-border)] flex-shrink-0"
          style={{ background: isValidHex(value) ? value : '#000' }}
          aria-hidden="true"
        />
      </div>
      {error && (
        <p id={errorId} role="alert" className="text-xs text-[var(--color-danger)]">{error}</p>
      )}
      <div className="grid grid-cols-8 gap-1.5">
        {swatches.map((swatch) => (
          <button
            key={swatch}
            type="button"
            disabled={disabled}
            aria-label={`Color ${swatch}`}
            aria-pressed={value === swatch}
            onClick={() => set(swatch)}
            className={cn(
              'w-7 h-7 rounded-[var(--radius-sm)] border-2 transition-transform hover:scale-110',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]',
              value === swatch ? 'border-[var(--color-primary)]' : 'border-[var(--color-border)]'
            )}
            style={{ background: swatch }}
          />
        ))}
      </div>
    </div>
  );
}
