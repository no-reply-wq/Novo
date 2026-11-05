'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { Spinner } from './spinner';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  /** @deprecated Use leftIcon instead */
  icon?: React.ReactNode;
}

const variantClasses: Record<NonNullable<ButtonProps['variant']>, string> = {
  primary:
    'bg-[var(--color-primary)] text-[var(--color-primary-fg)] hover:opacity-90 focus-visible:ring-[var(--color-primary)]',
  secondary:
    'bg-[var(--color-bg-surface)] text-[var(--color-fg-base)] border border-[var(--color-border)] hover:bg-[var(--color-bg-muted)] focus-visible:ring-[var(--color-primary)]',
  ghost:
    'bg-transparent text-[var(--color-fg-base)] hover:bg-[var(--color-bg-muted)] focus-visible:ring-[var(--color-primary)]',
  danger:
    'bg-[var(--color-danger)] text-white hover:opacity-90 focus-visible:ring-[var(--color-danger)]',
};

const sizeClasses: Record<NonNullable<ButtonProps['size']>, string> = {
  sm: 'h-8 px-3 text-xs gap-1.5',
  md: 'h-9 px-4 text-sm gap-2',
  lg: 'h-11 px-6 text-base gap-2.5',
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'primary',
      size = 'md',
      loading = false,
      leftIcon,
      rightIcon,
      icon,
      children,
      className,
      disabled,
      ...props
    },
    ref
  ) => {
    const resolvedLeftIcon = leftIcon ?? icon;
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        aria-disabled={disabled || loading}
        aria-busy={loading}
        className={cn(
          'inline-flex items-center justify-center rounded-[var(--radius-md)] font-medium transition-all',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          variantClasses[variant],
          sizeClasses[size],
          className
        )}
        {...props}
      >
        {loading ? (
          <Spinner size={size === 'lg' ? 'md' : 'sm'} />
        ) : (
          resolvedLeftIcon && <span aria-hidden="true">{resolvedLeftIcon}</span>
        )}
        {children}
        {!loading && rightIcon && <span aria-hidden="true">{rightIcon}</span>}
      </button>
    );
  }
);

Button.displayName = 'Button';
