'use client';
<<<<<<< HEAD

=======
>>>>>>> 4d81d88 (feat(design): Wave 1 design system — tokens, Tailwind config, new UI components)
import * as React from 'react';
import { cn } from '@/lib/utils';
import { Label } from './label';

export interface FormFieldProps {
<<<<<<< HEAD
  label?: string;
  htmlFor?: string;
  required?: boolean;
  hint?: string;
  error?: string;
  className?: string;
  children: React.ReactNode;
}

export function FormField({
  label,
  htmlFor,
  required,
  hint,
  error,
  className,
  children,
}: FormFieldProps) {
  const id = htmlFor ?? React.useId();
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {label && (
        <Label htmlFor={id} required={required}>
          {label}
        </Label>
      )}
      {/* Clone child to inject id if it's a single element */}
      {React.Children.count(children) === 1 && React.isValidElement(children)
        ? React.cloneElement(children as React.ReactElement<{ id?: string; 'aria-describedby'?: string }>, {
            id,
            'aria-describedby': error ? `${id}-error` : hint ? `${id}-hint` : undefined,
          })
        : children}
      {hint && !error && (
        <p id={`${id}-hint`} className="text-xs text-[var(--color-fg-muted)]">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} role="alert" className="text-xs text-[var(--color-danger)]">
          {error}
        </p>
      )}
=======
  label?: string; htmlFor?: string; required?: boolean;
  hint?: string; error?: string; className?: string; children: React.ReactNode;
}

export function FormField({ label, htmlFor, required, hint, error, className, children }: FormFieldProps) {
  const uid = React.useId();
  const id = htmlFor ?? uid;
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {label && <Label htmlFor={id} required={required}>{label}</Label>}
      {React.Children.count(children) === 1 && React.isValidElement(children)
        ? React.cloneElement(children as React.ReactElement<{ id?: string; 'aria-describedby'?: string }>, {
            id, 'aria-describedby': error ? `${id}-error` : hint ? `${id}-hint` : undefined,
          })
        : children}
      {hint && !error && <p id={`${id}-hint`} className="text-xs text-[var(--color-fg-muted)]">{hint}</p>}
      {error && <p id={`${id}-error`} role="alert" className="text-xs text-[var(--color-danger)]">{error}</p>}
>>>>>>> 4d81d88 (feat(design): Wave 1 design system — tokens, Tailwind config, new UI components)
    </div>
  );
}
