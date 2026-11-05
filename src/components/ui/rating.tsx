'use client';

import * as React from 'react';
import { Star } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface RatingProps {
  value?: number;
  defaultValue?: number;
  onChange?: (value: number) => void;
  max?: number;
  halfStar?: boolean;
  readOnly?: boolean;
  size?: 'sm' | 'md' | 'lg';
  label?: string;
  className?: string;
}

const sizeMap = { sm: 14, md: 18, lg: 24 } as const;

export function Rating({
  value: controlledValue,
  defaultValue = 0,
  onChange,
  max = 5,
  halfStar = false,
  readOnly = false,
  size = 'md',
  label,
  className,
}: RatingProps) {
  const [internalValue, setInternalValue] = React.useState(defaultValue);
  const [hovered, setHovered] = React.useState<number | null>(null);
  const id = React.useId();

  const value = controlledValue ?? internalValue;
  const displayValue = hovered ?? value;
  const iconSize = sizeMap[size];

  const handleClick = (v: number) => {
    if (readOnly) return;
    if (!controlledValue) setInternalValue(v);
    onChange?.(v);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLButtonElement>, i: number) => {
    if (!halfStar) { setHovered(i); return; }
    const rect = (e.currentTarget as HTMLButtonElement).getBoundingClientRect();
    const half = e.clientX - rect.left < rect.width / 2;
    setHovered(half ? i - 0.5 : i);
  };

  return (
    <div className={cn('inline-flex flex-col gap-1', className)}>
      {label && <label className="text-sm font-medium text-[var(--color-fg-base)]">{label}</label>}
      <div
        role="slider"
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-label={label ?? 'Rating'}
        aria-readonly={readOnly}
        className="inline-flex gap-0.5"
        onMouseLeave={() => setHovered(null)}
      >
        {Array.from({ length: max }, (_, i) => {
          const starValue = i + 1;
          const filled = displayValue >= starValue;
          const halfFilled = halfStar && !filled && displayValue >= starValue - 0.5;
          return (
            <button
              key={i}
              type="button"
              disabled={readOnly}
              id={`${id}-star-${i}`}
              aria-label={`${starValue} star${starValue === 1 ? '' : 's'}`}
              onClick={() => handleClick(halfStar ? (hovered ?? starValue) : starValue)}
              onMouseMove={(e) => handleMouseMove(e, starValue)}
              className={cn(
                'relative focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] rounded',
                !readOnly && 'cursor-pointer hover:scale-110 transition-transform',
                readOnly && 'cursor-default'
              )}
            >
              <Star
                size={iconSize}
                className={cn(
                  'transition-colors',
                  filled || halfFilled
                    ? 'text-[var(--color-warning)]'
                    : 'text-[var(--color-border)]'
                )}
                fill={filled ? 'currentColor' : halfFilled ? 'url(#half)' : 'none'}
              />
            </button>
          );
        })}
      </div>
      {value > 0 && (
        <span className="text-xs text-[var(--color-fg-muted)]">
          {value}/{max}
        </span>
      )}
    </div>
  );
}
