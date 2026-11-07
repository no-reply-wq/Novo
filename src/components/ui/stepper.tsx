'use client';

import * as React from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

export type StepStatus = 'complete' | 'current' | 'upcoming';

export interface Step {
  key: string;
  label: string;
  description?: string;
  status?: StepStatus;
}

export interface StepperProps {
  steps: Step[];
  /** Active step key — component infers statuses when provided */
  activeKey?: string;
  orientation?: 'horizontal' | 'vertical';
  className?: string;
}

export function Stepper({ steps, activeKey, orientation = 'horizontal', className }: StepperProps) {
  // Derive statuses from activeKey if not set per step
  const resolved = steps.map((s, i) => {
    if (s.status) return s;
    const activeIdx = steps.findIndex((x) => x.key === activeKey);
    const status: StepStatus =
      i < activeIdx ? 'complete' : i === activeIdx ? 'current' : 'upcoming';
    return { ...s, status };
  });

  const isH = orientation === 'horizontal';

  return (
    <nav
      aria-label="Progress"
      className={cn(isH ? 'flex items-start gap-0' : 'flex flex-col gap-0', className)}
    >
      {resolved.map((step, idx) => {
        const isComplete = step.status === 'complete';
        const isCurrent = step.status === 'current';
        const isLast = idx === resolved.length - 1;

        return (
          <React.Fragment key={step.key}>
            <div
              className={cn(
                'flex',
                isH ? 'flex-col items-center' : 'flex-row items-start gap-3',
                isH && 'flex-1'
              )}
            >
              {/* Circle */}
              <div className="relative flex items-center justify-center">
                <div
                  aria-current={isCurrent ? 'step' : undefined}
                  className={cn(
                    'w-8 h-8 rounded-full border-2 flex items-center justify-center text-xs font-semibold transition-colors',
                    isComplete &&
                      'border-[var(--color-primary)] bg-[var(--color-primary)] text-white',
                    isCurrent &&
                      'border-[var(--color-primary)] bg-white text-[var(--color-primary)] dark:bg-[var(--color-bg-surface)]',
                    !isComplete &&
                      !isCurrent &&
                      'border-[var(--color-border)] bg-[var(--color-bg-base)] text-[var(--color-fg-muted)]'
                  )}
                >
                  {isComplete ? <Check size={14} strokeWidth={2.5} /> : idx + 1}
                </div>
              </div>

              {/* Label + description */}
              <div className={cn('mt-2 text-center', !isH && 'mt-0 text-left pb-6')}>
                <p
                  className={cn(
                    'text-xs font-medium',
                    isCurrent ? 'text-[var(--color-primary)]' : 'text-[var(--color-fg-muted)]',
                    isComplete && 'text-[var(--color-fg-base)]'
                  )}
                >
                  {step.label}
                </p>
                {step.description && (
                  <p className="text-xs text-[var(--color-fg-muted)] mt-0.5">{step.description}</p>
                )}
              </div>
            </div>

            {/* Connector line */}
            {!isLast && (
              <div
                className={cn(
                  'flex-1',
                  isH
                    ? 'h-0.5 mt-4 mx-1 self-start'
                    : 'w-0.5 ml-4 my-0.5 h-6 self-stretch',
                  isComplete
                    ? 'bg-[var(--color-primary)]'
                    : 'bg-[var(--color-border)]'
                )}
                aria-hidden="true"
              />
            )}
          </React.Fragment>
        );
      })}
    </nav>
  );
}
