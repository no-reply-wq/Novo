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
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => { setMounted(true); }, []);

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
      {mounted && createPortal(
        <div
          aria-label="Notifications"
          className="fixed top-4 right-4 z-[9999] flex flex-col gap-2 items-end"
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

// ─── Compatibility shim ───────────────────────────────────────────────────────
// Legacy pages use <Toast message="…" type="success" onDismiss={fn} />.
// Previously this rendered INLINE wherever the page placed it — on long pages
// that was below the fold, so saves looked like they did nothing. It now
// portals to a fixed top-right position like the provider-driven toasts, and
// auto-dismisses, so feedback is always visible regardless of where a legacy
// page mounts it.

export interface ToastProps {
  message: React.ReactNode;
  type?: 'success' | 'error' | 'warning' | 'info';
  onDismiss?: () => void;
  /** ms before auto-dismiss; 0 = stays until dismissed. */
  duration?: number;
}

export function Toast({ message, type = 'info', onDismiss, duration = 4000 }: ToastProps) {
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => { setMounted(true); }, []);

  const variantMap: Record<string, ToastVariant> = {
    success: 'success', error: 'error', warning: 'warning', info: 'info',
  };

  if (!mounted) return null;
  return createPortal(
    <div className="fixed top-4 right-4 z-[9999] flex flex-col items-end" style={{ maxWidth: 'calc(100vw - 2rem)' }}>
      <ToastEntry
        id="inline"
        message={message}
        variant={variantMap[type] ?? 'info'}
        duration={duration}
        onDismiss={() => onDismiss?.()}
      />
    </div>,
    document.body
  );
}

// ─── ConfirmDialog stub ───────────────────────────────────────────────────────
// Wave 1 does not ship a full confirm dialog — pages that use it compile
// against this stub and will show nothing until the component is built.

export interface ConfirmDialogProps {
  open: boolean;
  title?: string;
  message?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'primary' | string;
  onConfirm?: () => void | Promise<void>;
  onCancel?: () => void;
}

export function ConfirmDialog({ open, title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel', variant = 'primary', onConfirm, onCancel }: ConfirmDialogProps) {
  const [busy, setBusy] = React.useState(false);
  React.useEffect(() => { if (!open) setBusy(false); }, [open]);
  if (!open) return null;

  const confirmColor = variant === 'danger' ? 'var(--color-danger)' : 'var(--color-primary)';

  async function handleConfirm() {
    if (busy) return;
    setBusy(true);
    try {
      await onConfirm?.();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div role="dialog" aria-modal="true" aria-label={title ?? 'Confirm'} className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-[var(--color-bg-surface)] border border-[var(--color-border)] rounded-[var(--radius-lg)] p-6 shadow-[var(--shadow-lg)] max-w-sm w-full mx-4">
        {title && <h2 className="text-base font-semibold text-[var(--color-fg-base)] mb-2">{title}</h2>}
        {message && <p className="text-sm text-[var(--color-fg-muted)] mb-4">{message}</p>}
        <div className="flex gap-2 justify-end">
          <button disabled={busy} onClick={onCancel} className="px-3 py-1.5 text-sm rounded-[var(--radius-md)] border border-[var(--color-border)] text-[var(--color-fg-base)] hover:bg-[var(--color-bg-muted)] disabled:opacity-50">{cancelLabel}</button>
          <button disabled={busy} onClick={handleConfirm} style={{ background: confirmColor }} className="px-3 py-1.5 text-sm rounded-[var(--radius-md)] text-white hover:opacity-90 disabled:opacity-60">
            {busy ? 'Working…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
