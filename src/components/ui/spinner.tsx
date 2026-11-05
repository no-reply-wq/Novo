'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

export interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  label?: string;
}

const sizeMap = { sm: 'w-4 h-4', md: 'w-5 h-5', lg: 'w-8 h-8' } as const;

export function Spinner({ size = 'md', className, label = 'Loading…' }: SpinnerProps) {
  return (
    <svg
      role="status"
      aria-label={label}
      className={cn('animate-spin text-[var(--color-primary)]', sizeMap[size], className)}
      viewBox="0 0 24 24"
      fill="none"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}
