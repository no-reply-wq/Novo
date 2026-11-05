'use client';

import * as React from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  description?: string;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  hideClose?: boolean;
}

const sizeMap = {
  sm: 'max-w-sm',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
} as const;

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  size = 'md',
  className,
  hideClose = false,
}: ModalProps) {
  const panelRef = React.useRef<HTMLDivElement>(null);
  const titleId = React.useId();
  const descId = React.useId();

  // Focus trap
  React.useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    if (panel) {
      const focusable = panel.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      focusable[0]?.focus();
    }
    return () => {
      previous?.focus();
    };
  }, [open]);

  // Escape key
  React.useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  // Prevent body scroll
  React.useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  if (!open) return null;
  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? titleId : undefined}
      aria-describedby={description ? descId : undefined}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        aria-hidden="true"
        onClick={onClose}
      />

      {/* Panel */}
      <div
        ref={panelRef}
        className={cn(
          'relative w-full flex flex-col max-h-[90vh] rounded-[var(--radius-lg)] bg-[var(--color-bg-surface)] border border-[var(--color-border)] shadow-[var(--shadow-lg)]',
          sizeMap[size],
          className
        )}
      >
        {(title || !hideClose) && (
          <div className="flex items-center justify-between gap-4 px-6 py-4 border-b border-[var(--color-border)]">
            {title && (
              <h2
                id={titleId}
                className="text-base font-semibold text-[var(--color-fg-base)]"
              >
                {title}
              </h2>
            )}
            {!hideClose && (
              <button
                onClick={onClose}
                aria-label="Close dialog"
                className={cn(
                  'ml-auto p-1.5 rounded-[var(--radius-sm)] text-[var(--color-fg-muted)]',
                  'hover:bg-[var(--color-bg-muted)] hover:text-[var(--color-fg-base)] transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]'
                )}
              >
                <X size={16} />
              </button>
            )}
          </div>
        )}

        {description && (
          <p id={descId} className="sr-only">
            {description}
          </p>
        )}

        <div className="overflow-y-auto flex-1 p-6">{children}</div>
      </div>
    </div>,
    document.body
  );
}
