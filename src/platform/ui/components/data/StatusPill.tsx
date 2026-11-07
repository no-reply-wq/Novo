'use client';

import React from 'react';
import { cn } from '@/lib/utils';

export interface StatusConfig {
  label: string;
  color: string;
  bgColor: string;
}

export interface StatusPillProps {
  value: string;
  config?: Record<string, StatusConfig>;
  className?: string;
}

const DEFAULT_CONFIG: Record<string, StatusConfig> = {
  active:    { label: 'Active',    color: '#16a34a', bgColor: '#dcfce7' },
  inactive:  { label: 'Inactive',  color: '#6b7280', bgColor: '#f3f4f6' },
  pending:   { label: 'Pending',   color: '#d97706', bgColor: '#fef3c7' },
  error:     { label: 'Error',     color: '#dc2626', bgColor: '#fee2e2' },
  success:   { label: 'Success',   color: '#16a34a', bgColor: '#dcfce7' },
  warning:   { label: 'Warning',   color: '#d97706', bgColor: '#fef3c7' },
  draft:     { label: 'Draft',     color: '#6b7280', bgColor: '#f3f4f6' },
  cancelled: { label: 'Cancelled', color: '#dc2626', bgColor: '#fee2e2' },
  open:      { label: 'Open',      color: '#2563eb', bgColor: '#dbeafe' },
  closed:    { label: 'Closed',    color: '#6b7280', bgColor: '#f3f4f6' },
};

export function StatusPill({ value, config, className }: StatusPillProps) {
  const merged = { ...DEFAULT_CONFIG, ...(config ?? {}) };
  const cfg = merged[value?.toLowerCase?.()] ?? { label: value, color: '#6b7280', bgColor: '#f3f4f6' };
  return (
    <span
      className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium', className)}
      style={{ color: cfg.color, backgroundColor: cfg.bgColor }}
    >
      <span className="mr-1 h-1.5 w-1.5 rounded-full" style={{ background: cfg.color }} />
      {cfg.label}
    </span>
  );
}
