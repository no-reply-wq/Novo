'use client';

import * as React from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface AccordionItem {
  key: string;
  title: React.ReactNode;
  content: React.ReactNode;
  disabled?: boolean;
}

export interface AccordionProps {
  items: AccordionItem[];
  mode?: 'single' | 'multi';
  defaultOpenKeys?: string[];
  openKeys?: string[];
  onOpenChange?: (keys: string[]) => void;
  className?: string;
}

export function Accordion({
  items,
  mode = 'single',
  defaultOpenKeys = [],
  openKeys: controlledKeys,
  onOpenChange,
  className,
}: AccordionProps) {
  const [internalKeys, setInternalKeys] = React.useState<string[]>(defaultOpenKeys);
  const openKeys = controlledKeys ?? internalKeys;

  const toggle = (key: string) => {
    let next: string[];
    if (openKeys.includes(key)) {
      next = openKeys.filter((k) => k !== key);
    } else {
      next = mode === 'single' ? [key] : [...openKeys, key];
    }
    if (!controlledKeys) setInternalKeys(next);
    onOpenChange?.(next);
  };

  return (
    <div className={cn('divide-y divide-[var(--color-border)] border border-[var(--color-border)] rounded-[var(--radius-lg)] overflow-hidden', className)}>
      {items.map((item) => {
        const isOpen = openKeys.includes(item.key);
        const panelId = `accordion-panel-${item.key}`;
        const triggerId = `accordion-trigger-${item.key}`;
        return (
          <div key={item.key}>
            <h3>
              <button
                id={triggerId}
                aria-expanded={isOpen}
                aria-controls={panelId}
                disabled={item.disabled}
                onClick={() => !item.disabled && toggle(item.key)}
                className={cn(
                  'w-full flex items-center justify-between gap-4 px-5 py-4 text-sm font-medium text-left',
                  'bg-[var(--color-bg-surface)] hover:bg-[var(--color-bg-muted)] transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--color-primary)]',
                  'disabled:opacity-40 disabled:cursor-not-allowed'
                )}
              >
                <span className="text-[var(--color-fg-base)]">{item.title}</span>
                <ChevronDown
                  size={16}
                  className={cn(
                    'text-[var(--color-fg-muted)] flex-shrink-0 transition-transform duration-200',
                    isOpen && 'rotate-180'
                  )}
                />
              </button>
            </h3>
            <div
              id={panelId}
              role="region"
              aria-labelledby={triggerId}
              hidden={!isOpen}
            >
              <div className="px-5 py-4 text-sm text-[var(--color-fg-muted)] bg-[var(--color-bg-base)]">
                {item.content}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
