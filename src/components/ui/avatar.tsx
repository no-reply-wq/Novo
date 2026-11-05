'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

export interface AvatarProps {
  src?: string;
  alt?: string;
  name?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

const sizeMap = {
  xs: 'w-6 h-6 text-xs',
  sm: 'w-8 h-8 text-xs',
  md: 'w-10 h-10 text-sm',
  lg: 'w-12 h-12 text-base',
  xl: 'w-16 h-16 text-lg',
} as const;

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

function getColor(name: string): string {
  const colors = [
    '#2563eb',
    '#7c3aed',
    '#16a34a',
    '#ca8a04',
    '#dc2626',
    '#0891b2',
    '#c026d3',
    '#ea580c',
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

export function Avatar({ src, alt, name, size = 'md', className }: AvatarProps) {
  const [imgError, setImgError] = React.useState(false);
  const displayName = alt ?? name ?? '';
  const initials = name ? getInitials(name) : '?';
  const bgColor = name ? getColor(name) : 'var(--color-fg-muted)';

  const showImage = src && !imgError;

  return (
    <span
      className={cn(
        'inline-flex items-center justify-center rounded-full overflow-hidden font-medium flex-shrink-0',
        sizeMap[size],
        className
      )}
      aria-label={displayName || 'Avatar'}
      role={displayName ? 'img' : undefined}
      style={!showImage ? { backgroundColor: bgColor, color: '#fff' } : undefined}
    >
      {showImage ? (
        <img
          src={src}
          alt={displayName}
          className="w-full h-full object-cover"
          onError={() => setImgError(true)}
        />
      ) : (
        initials
      )}
    </span>
  );
}
