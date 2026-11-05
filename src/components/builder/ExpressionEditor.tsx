'use client';

/**
 * ExpressionEditor — stub implementation.
 * Agent M builds the full expression editor; this stub is used until that
 * component is available at @/components/builder/ExpressionEditor.
 */

import * as React from 'react';
import { cn } from '@/lib/utils';

export interface ExpressionEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
  className?: string;
  /** Field suggestions for autocomplete (provided by the full implementation) */
  fieldSuggestions?: Array<{ key: string; label: string }>;
}

export function ExpressionEditor({
  value,
  onChange,
  placeholder = 'Enter expression…',
  rows = 4,
  className,
}: ExpressionEditorProps) {
  return (
    <textarea
      value={value}
      onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      spellCheck={false}
      className={cn(
        'w-full resize-y rounded-[var(--radius-md)] border border-[var(--color-border)]',
        'bg-[var(--color-bg-surface)] px-3 py-2 font-mono text-sm',
        'text-[var(--color-fg-base)] placeholder:text-[var(--color-fg-muted)]',
        'focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] focus:ring-offset-1',
        className
      )}
    />
  );
}
