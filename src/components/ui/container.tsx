'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

export interface ContainerProps {
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  className?: string;
}

const sizeMap = {
  sm: 'max-w-2xl',
  md: 'max-w-4xl',
  lg: 'max-w-6xl',
  xl: 'max-w-7xl',
  full: 'max-w-full',
} as const;

export function Container({ children, size = 'lg', className }: ContainerProps) {
  return (
    <div className={cn('w-full mx-auto px-4 sm:px-6 lg:px-8', sizeMap[size], className)}>
      {children}
    </div>
  );
}
