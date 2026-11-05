'use client';

import * as React from 'react';
import { createPortal } from 'react-dom';
import { X, CheckCircle, AlertTriangle, XCircle, Info } from 'lucide-react';
import { cn } from '@/lib/utils';

export type ToastVariant = 'success' | 'warning' | 'error' | 'info';

export interface ToastItem {
  id: string;
  message: React.ReactNode;
  variant?: ToastVariant;
  duration?: number; // ms, 0 = persistent
  title?: string;
}

interface ToastEntryProps extends ToastItem {
  onDismiss: (id: string) => void;
}

const variantConfig: Record<ToastVariant, { icon: React.ReactNode; class: string }> = {
  success: {
    icon: <CheckCircle size={16} />,
    class: 'border-l-[var(--color-success)] text-[var(--color-success)]',
  },
  warning: {
    icon: <AlertTriangle size={16} />,
    class: 'border-l-[var(--color-warning)] text-[var(--color-warning)]',
  },
  error: {
    icon: <XCircle size={16} />,
    class: 'border-l-[var(--color-danger)] text-[var(--color-danger)]',
  },
  info: {
    icon: <Info size={16} />,
    class: 'border-l-[var(--color-info)] text-[var(--color-info)]',
  },
};

function ToastEntry({ id, message, title, variant = 'info', duration = 4000, onDismiss }: ToastEntryProps) {
  const config = variantConfig[variant];

  React.useEffect(() => {
    if (duration === 0) return;
    const timer = setTimeout(() => onDismiss(id), duration);
    return () => clearTimeout(timer);
  }, [id, duration, onDismiss]);

  return (
    <div
      role="alert"
      aria-live="polite"
      className={cn(
        'flex items-start gap-3 p-4 rounded-[var(--radius-md)] bg-[var(--color-bg-surface)] border border-[var(--color-border)] border-l-4 shadow-[var(--shadow-lg)]',
        'max-w-sm w-full',
        config.class
      )}
    >
      <span className="mt-0.5 flex-shrink-0" aria-hidden="true">{config.icon}</span>
      <div className="flex-1 min-w-0">
        {title && <p className="text-sm font-semibold text-[var(--color-fg-base)] mb-0.5">{title}</p>}
        <p className="text-sm text-[var(--color-fg-muted)]">{message}</p>
      </div>
      <button
        onClick={() => onDismiss(id)}
        aria-label="Dismiss notification"
        className={cn(
          'flex-shrink-0 p-0.5 rounded text-[var(--color-fg-muted)] hover:text-[var(--color-fg-base)] transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]'
        )}
      >
        <X size={14} />
      </button>
    </div>
  );
}

// ─── Toast Context ───────────────────────────────────────────

interface ToastContextValue {
  add: (item: Omit<ToastItem, 'id'>) => string;
  dismiss: (id: string) => void;
  success: (message: React.ReactNode, options?: Partial<ToastItem>) => string;
  error: (message: React.ReactNode, options?: Partial<ToastItem>) => string;
  warning: (message: React.ReactNode, options?: Partial<ToastItem>) => string;
  info: (message: React.ReactNode, options?: Partial<ToastItem>) => string;
}

const ToastContext = React.createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = React.useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<ToastItem[]>([]);

  const dismiss = React.useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const add = React.useCallback((item: Omit<ToastItem, 'id'>): string => {
    const id = `toast-${Date.now()}-${Math.random()}`;
    setToasts((prev) => [...prev.slice(-4), { ...item, id }]);
    return id;
  }, []);

  const success = React.useCallback((message: React.ReactNode, options?: Partial<ToastItem>) =>
    add({ ...options, message, variant: 'success' }), [add]);
  const error = React.useCallback((message: React.ReactNode, options?: Partial<ToastItem>) =>
    add({ ...options, message, variant: 'error' }), [add]);
  const warning = React.useCallback((message: React.ReactNode, options?: Partial<ToastItem>) =>
    add({ ...options, message, variant: 'warning' }), [add]);
  const info = React.useCallback((message: React.ReactNode, options?: Partial<ToastItem>) =>
    add({ ...options, message, variant: 'info' }), [add]);

  return (
    <ToastContext.Provider value={{ add, dismiss, success, error, warning, info }}>
      {children}
      {typeof document !== 'undefined' && createPortal(
        <div
          aria-label="Notifications"
          className="fixed bottom-4 right-4 z-[9999] flex flex-col gap-2 items-end"
          style={{ maxWidth: 'calc(100vw - 2rem)' }}
        >
          {toasts.map((t) => (
            <ToastEntry key={t.id} {...t} onDismiss={dismiss} />
          ))}
        </div>,
        document.body
      )}
    </ToastContext.Provider>
  );
}
