'use client';
<<<<<<< HEAD

=======
>>>>>>> 4d81d88 (feat(design): Wave 1 design system — tokens, Tailwind config, new UI components)
import * as React from 'react';
import { cn } from '@/lib/utils';

export interface LabelProps extends React.LabelHTMLAttributes<HTMLLabelElement> {
  required?: boolean;
}

export const Label = React.forwardRef<HTMLLabelElement, LabelProps>(
  ({ className, required, children, ...props }, ref) => (
    <label
      ref={ref}
<<<<<<< HEAD
      className={cn(
        'text-sm font-medium text-[var(--color-fg-base)] leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-50',
        className
      )}
      {...props}
    >
      {children}
      {required && (
        <span className="ml-1 text-[var(--color-danger)]" aria-hidden="true">
          *
        </span>
      )}
    </label>
  )
);

=======
      className={cn('text-sm font-medium text-[var(--color-fg-base)] leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-50', className)}
      {...props}
    >
      {children}
      {required && <span className="ml-1 text-[var(--color-danger)]" aria-hidden="true">*</span>}
    </label>
  )
);
>>>>>>> 4d81d88 (feat(design): Wave 1 design system — tokens, Tailwind config, new UI components)
Label.displayName = 'Label';
