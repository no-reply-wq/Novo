'use client';

import * as React from 'react';
import { X, CheckCircle, AlertTriangle, XCircle, Info } from 'lucide-react';
import { cn } from '@/lib/utils';

export type AlertVariant = 'success' | 'warning' | 'danger' | 'info';

export interface AlertProps {
  variant?: AlertVariant;
  title?: React.ReactNode;
  children?: React.ReactNode;
  dismissible?: boolean;
  onDismiss?: () => void;
  icon?: React.ReactNode;
  className?: string;
}

const variantConfig: Record<AlertVariant, { icon: React.ReactNode; classes: string }> = {
  success: {
    icon: <CheckCircle size={16} />,
    classes:
      'bg-[color-mix(in_srgb,var(--color-success)_8%,transparent)] border-[color-mix(in_srgb,var(--color-success)_30%,transparent)] text-[var(--color-success)]',
  },
  warning: {
    icon: <AlertTriangle size={16} />,
    classes:
      'bg-[color-mix(in_srgb,var(--color-warning)_8%,transparent)] border-[color-mix(in_srgb,var(--color-warning)_30%,transparent)] text-[var(--color-warning)]',
  },
  danger: {
    icon: <XCircle size={16} />,
    classes:
      'bg-[color-mix(in_srgb,var(--color-danger)_8%,transparent)] border-[color-mix(in_srgb,var(--color-danger)_30%,transparent)] text-[var(--color-danger)]',
  },
  info: {
    icon: <Info size={16} />,
    classes:
      'bg-[color-mix(in_srgb,var(--color-info)_8%,transparent)] border-[color-mix(in_srgb,var(--color-info)_30%,transparent)] text-[var(--color-info)]',
  },
};

export function Alert({
  variant = 'info',
  title,
  children,
  dismissible,
  onDismiss,
  icon,
  className,
}: AlertProps) {
  const [visible, setVisible] = React.useState(true);
  const config = variantConfig[variant];

  if (!visible) return null;

  const handleDismiss = () => {
    setVisible(false);
    onDismiss?.();
  };

  return (
    <div
      role="alert"
      className={cn(
        'flex gap-3 p-4 rounded-[var(--radius-md)] border',
        config.classes,
        className
      )}
    >
      <span className="mt-0.5 flex-shrink-0" aria-hidden="true">
        {icon ?? config.icon}
      </span>
      <div className="flex-1 min-w-0">
        {title && (
          <p className="text-sm font-semibold text-[var(--color-fg-base)] mb-1">{title}</p>
        )}
        {children && (
          <div className="text-sm text-[var(--color-fg-muted)]">{children}</div>
        )}
      </div>
      {dismissible && (
        <button
          onClick={handleDismiss}
          aria-label="Dismiss"
          className={cn(
            'flex-shrink-0 p-0.5 rounded opacity-60 hover:opacity-100 transition-opacity',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current'
          )}
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
}
