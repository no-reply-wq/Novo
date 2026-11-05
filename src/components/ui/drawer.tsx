'use client';

import * as React from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  children: React.ReactNode;
  side?: 'left' | 'right' | 'bottom';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const sideStyles = {
  left: {
    wrapper: 'justify-start',
    panel: 'h-full',
    size: { sm: 'w-72', md: 'w-96', lg: 'w-[480px]' },
    enter: 'translate-x-0',
    exit: '-translate-x-full',
  },
  right: {
    wrapper: 'justify-end',
    panel: 'h-full',
    size: { sm: 'w-72', md: 'w-96', lg: 'w-[480px]' },
    enter: 'translate-x-0',
    exit: 'translate-x-full',
  },
  bottom: {
    wrapper: 'items-end',
    panel: 'w-full rounded-t-[var(--radius-lg)]',
    size: { sm: 'max-h-64', md: 'max-h-96', lg: 'max-h-[70vh]' },
    enter: 'translate-y-0',
    exit: 'translate-y-full',
  },
} as const;

export function Drawer({
  open,
  onClose,
  title,
  children,
  side = 'right',
  size = 'md',
  className,
}: DrawerProps) {
  const panelRef = React.useRef<HTMLDivElement>(null);
  const titleId = React.useId();

  React.useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    return () => previous?.focus();
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  React.useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  if (!open || typeof document === 'undefined') return null;

  const config = sideStyles[side];

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? titleId : undefined}
      className={cn('fixed inset-0 z-50 flex', config.wrapper)}
    >
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        aria-hidden="true"
        onClick={onClose}
      />
      <div
        ref={panelRef}
        tabIndex={-1}
        className={cn(
          'relative flex flex-col bg-[var(--color-bg-surface)] border-[var(--color-border)] shadow-[var(--shadow-lg)] overflow-hidden focus-visible:outline-none',
          config.panel,
          config.size[size],
          side !== 'bottom' && 'border-x',
          side === 'bottom' && 'border-t',
          className
        )}
      >
        <div className="flex items-center justify-between gap-4 px-5 py-4 border-b border-[var(--color-border)]">
          {title && (
            <h2
              id={titleId}
              className="text-base font-semibold text-[var(--color-fg-base)]"
            >
              {title}
            </h2>
          )}
          <button
            onClick={onClose}
            aria-label="Close drawer"
            className={cn(
              'ml-auto p-1.5 rounded-[var(--radius-sm)] text-[var(--color-fg-muted)]',
              'hover:bg-[var(--color-bg-muted)] hover:text-[var(--color-fg-base)] transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]'
            )}
          >
            <X size={16} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">{children}</div>
      </div>
    </div>,
    document.body
  );
}
