'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import type { LucideIcon } from 'lucide-react';

export interface IconProps {
  icon: LucideIcon;
  size?: number;
  className?: string;
  label?: string;
}

export function Icon({ icon: IconComponent, size = 16, className, label }: IconProps) {
  return (
    <IconComponent
      size={size}
      aria-hidden={!label}
      aria-label={label}
      role={label ? 'img' : undefined}
      className={cn('flex-shrink-0', className)}
    />
  );
}
