'use client';

import React, { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ButtonComponentProps {
  label: string;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  disabled?: boolean;
  onClick?: () => void | Promise<void>;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  fullWidth?: boolean;
}

const variantClasses: Record<NonNullable<ButtonComponentProps['variant']>, string> = {
  primary:
    'bg-indigo-600 text-white hover:bg-indigo-700 focus-visible:ring-indigo-500',
  secondary:
    'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 focus-visible:ring-gray-400',
  ghost:
    'bg-transparent text-gray-600 hover:bg-gray-100 focus-visible:ring-gray-400',
  danger:
    'bg-red-600 text-white hover:bg-red-700 focus-visible:ring-red-500',
};

export function ButtonComponent({
  label,
  variant = 'primary',
  disabled = false,
  onClick,
  leftIcon,
  rightIcon,
  fullWidth = false,
}: ButtonComponentProps) {
  const [isLoading, setIsLoading] = useState(false);

  const handleClick = async () => {
    if (!onClick || isLoading || disabled) return;
    setIsLoading(true);
    try {
      await onClick();
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <button
      type="button"
      onClick={() => void handleClick()}
      disabled={disabled || isLoading}
      className={cn(
        'inline-flex items-center justify-center gap-1.5 rounded px-3 py-1.5 text-sm font-medium',
        'transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1',
        'disabled:pointer-events-none disabled:opacity-50',
        variantClasses[variant],
        fullWidth && 'w-full',
      )}
    >
      {isLoading ? (
        <Loader2 size={14} className="animate-spin" aria-hidden="true" />
      ) : (
        leftIcon
      )}
      {label}
      {!isLoading && rightIcon}
    </button>
  );
}
