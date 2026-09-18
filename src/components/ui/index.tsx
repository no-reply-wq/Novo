'use client';
import React from 'react';
import { cn } from '@/lib/utils';

// ─────────────────────────────────────────────────────────────
// Button
// ─────────────────────────────────────────────────────────────

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  icon?: React.ReactNode;
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading,
  icon,
  children,
  className,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center gap-2 rounded-lg font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed',
        {
          'bg-indigo-600 text-white hover:bg-indigo-700 focus-visible:ring-indigo-600': variant === 'primary',
          'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50': variant === 'secondary',
          'bg-transparent text-slate-600 hover:bg-slate-100': variant === 'ghost',
          'bg-red-600 text-white hover:bg-red-700': variant === 'danger',
          'border border-indigo-300 text-indigo-700 hover:bg-indigo-50': variant === 'outline',
          'px-2.5 py-1.5 text-xs': size === 'sm',
          'px-4 py-2 text-sm': size === 'md',
          'px-6 py-3 text-base': size === 'lg',
        },
        className
      )}
      {...props}
    >
      {loading ? (
        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      ) : icon}
      {children}
    </button>
  );
}

// ─────────────────────────────────────────────────────────────
// Input
// ─────────────────────────────────────────────────────────────

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, className, id, ...props }, ref) => {
    const inputId = id ?? label?.toLowerCase().replace(/\s+/g, '-');
    return (
      <div className="space-y-1">
        {label && (
          <label htmlFor={inputId} className="block text-sm font-medium text-slate-700">
            {label}
            {props.required && <span className="text-red-500 ml-1">*</span>}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          className={cn(
            'block w-full rounded-lg border px-3 py-2 text-sm transition-colors',
            'placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent',
            error
              ? 'border-red-300 bg-red-50'
              : 'border-slate-200 bg-white hover:border-slate-300',
            className
          )}
          {...props}
        />
        {error && <p className="text-xs text-red-600">{error}</p>}
        {hint && !error && <p className="text-xs text-slate-500">{hint}</p>}
      </div>
    );
  }
);
Input.displayName = 'Input';

// ─────────────────────────────────────────────────────────────
// Select
// ─────────────────────────────────────────────────────────────

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  hint?: string;
  options: Array<{ value: string | number; label: string }>;
  placeholder?: string;
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, error, hint, options, placeholder, className, id, ...props }, ref) => {
    const inputId = id ?? label?.toLowerCase().replace(/\s+/g, '-');
    return (
      <div className="space-y-1">
        {label && (
          <label htmlFor={inputId} className="block text-sm font-medium text-slate-700">
            {label}
            {props.required && <span className="text-red-500 ml-1">*</span>}
          </label>
        )}
        <select
          ref={ref}
          id={inputId}
          className={cn(
            'block w-full rounded-lg border px-3 py-2 text-sm bg-white transition-colors',
            'focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent',
            error ? 'border-red-300' : 'border-slate-200 hover:border-slate-300',
            className
          )}
          {...props}
        >
          {placeholder && <option value="">{placeholder}</option>}
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        {hint && !error && <p className="text-xs text-slate-500">{hint}</p>}
        {error && <p className="text-xs text-red-600">{error}</p>}
      </div>
    );
  }
);
Select.displayName = 'Select';

// ─────────────────────────────────────────────────────────────
// Textarea
// ─────────────────────────────────────────────────────────────

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, error, className, id, ...props }, ref) => {
    const inputId = id ?? label?.toLowerCase().replace(/\s+/g, '-');
    return (
      <div className="space-y-1">
        {label && (
          <label htmlFor={inputId} className="block text-sm font-medium text-slate-700">
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          id={inputId}
          rows={3}
          className={cn(
            'block w-full rounded-lg border px-3 py-2 text-sm transition-colors resize-y',
            'placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent',
            error ? 'border-red-300 bg-red-50' : 'border-slate-200 hover:border-slate-300',
            className
          )}
          {...props}
        />
        {error && <p className="text-xs text-red-600">{error}</p>}
      </div>
    );
  }
);
Textarea.displayName = 'Textarea';

// ─────────────────────────────────────────────────────────────
// Badge
// ─────────────────────────────────────────────────────────────

interface BadgeProps {
  children: React.ReactNode;
  color?: string;
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info';
  className?: string;
  icon?: React.ReactNode;
}

export function Badge({ children, color, variant = 'default', className, icon }: BadgeProps) {
  if (color) {
    return (
      <span
        className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium', className)}
        style={{ backgroundColor: `${color}20`, color }}
      >
        {icon && <span className="mr-1">{icon}</span>}
        {children}
      </span>
    );
  }

  return (
    <span
      className={cn(
        'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium',
        {
          'bg-slate-100 text-slate-700': variant === 'default',
          'bg-green-100 text-green-700': variant === 'success',
          'bg-amber-100 text-amber-700': variant === 'warning',
          'bg-red-100 text-red-700': variant === 'danger',
          'bg-blue-100 text-blue-700': variant === 'info',
        },
        className
      )}
    >
      {children}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────
// Card
// ─────────────────────────────────────────────────────────────

export function Card({
  children,
  className,
  padding = true,
}: {
  children: React.ReactNode;
  className?: string;
  padding?: boolean;
}) {
  return (
    <div className={cn('bg-white rounded-xl border border-slate-200 shadow-sm', padding && 'p-6', className)}>
      {children}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Modal/Dialog
// ─────────────────────────────────────────────────────────────

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
}

export function Modal({ open, onClose, title, children, size = 'md' }: ModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        className={cn(
          'relative bg-white rounded-xl shadow-xl flex flex-col max-h-[90vh] w-full mx-4',
          {
            'max-w-sm': size === 'sm',
            'max-w-md': size === 'md',
            'max-w-2xl': size === 'lg',
            'max-w-4xl': size === 'xl',
            'max-w-7xl': size === 'full',
          }
        )}
      >
        <div className="flex items-center justify-between p-6 border-b border-slate-100">
          <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="overflow-y-auto p-6 flex-1">{children}</div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Toast notification (simple)
// ─────────────────────────────────────────────────────────────

export function Toast({
  message,
  type = 'success',
  onDismiss,
}: {
  message: string;
  type?: 'success' | 'error' | 'info';
  onDismiss?: () => void;
}) {
  return (
    <div
      className={cn(
        'fixed bottom-6 right-6 flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg text-sm font-medium z-50 max-w-sm',
        {
          'bg-green-600 text-white': type === 'success',
          'bg-red-600 text-white': type === 'error',
          'bg-blue-600 text-white': type === 'info',
        }
      )}
    >
      {message}
      {onDismiss && (
        <button onClick={onDismiss} className="ml-auto opacity-75 hover:opacity-100">×</button>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Empty state
// ─────────────────────────────────────────────────────────────

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      {icon && <div className="text-slate-300 mb-4">{icon}</div>}
      <h3 className="text-slate-900 font-medium mb-1">{title}</h3>
      {description && <p className="text-sm text-slate-500 mb-4 max-w-sm">{description}</p>}
      {action}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Loading spinner
// ─────────────────────────────────────────────────────────────

export function Spinner({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  return (
    <svg
      className={cn('animate-spin text-indigo-600', {
        'w-4 h-4': size === 'sm',
        'w-6 h-6': size === 'md',
        'w-8 h-8': size === 'lg',
      })}
      viewBox="0 0 24 24"
      fill="none"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────
// Confirm dialog
// ─────────────────────────────────────────────────────────────

export function ConfirmDialog({
  open,
  onConfirm,
  onCancel,
  title,
  message,
  confirmLabel = 'Confirm',
  variant = 'danger',
}: {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  variant?: 'danger' | 'primary';
}) {
  return (
    <Modal open={open} onClose={onCancel} title={title} size="sm">
      <p className="text-sm text-slate-600 mb-6">{message}</p>
      <div className="flex justify-end gap-3">
        <Button variant="secondary" onClick={onCancel}>Cancel</Button>
        <Button variant={variant} onClick={onConfirm}>{confirmLabel}</Button>
      </div>
    </Modal>
  );
}
