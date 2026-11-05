'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

export interface TabItem {
  key: string;
  label: React.ReactNode;
  disabled?: boolean;
}

export interface TabsProps {
  items: TabItem[];
  activeKey?: string;
  defaultActiveKey?: string;
  onChange?: (key: string) => void;
  variant?: 'line' | 'pill';
  className?: string;
  children?: React.ReactNode;
}

export function Tabs({
  items,
  activeKey: controlledKey,
  defaultActiveKey,
  onChange,
  variant = 'line',
  className,
}: TabsProps) {
  const [internalKey, setInternalKey] = React.useState(
    defaultActiveKey ?? items[0]?.key ?? ''
  );

  const active = controlledKey ?? internalKey;

  const handleSelect = (key: string) => {
    if (!controlledKey) setInternalKey(key);
    onChange?.(key);
  };

  const handleKeyDown = (e: React.KeyboardEvent, currentIndex: number) => {
    const enabled = items.filter((i) => !i.disabled);
    const currentEnabledIndex = enabled.findIndex((i) => i.key === items[currentIndex].key);
    if (e.key === 'ArrowRight') {
      const next = enabled[(currentEnabledIndex + 1) % enabled.length];
      if (next) handleSelect(next.key);
    }
    if (e.key === 'ArrowLeft') {
      const prev = enabled[(currentEnabledIndex - 1 + enabled.length) % enabled.length];
      if (prev) handleSelect(prev.key);
    }
  };

  return (
    <div
      role="tablist"
      aria-orientation="horizontal"
      className={cn(
        'flex gap-1',
        variant === 'line' &&
          'border-b border-[var(--color-border)] gap-0',
        variant === 'pill' &&
          'bg-[var(--color-bg-muted)] p-1 rounded-[var(--radius-lg)] w-fit',
        className
      )}
    >
      {items.map((item, i) => {
        const isActive = item.key === active;
        return (
          <button
            key={item.key}
            role="tab"
            aria-selected={isActive}
            aria-disabled={item.disabled}
            disabled={item.disabled}
            tabIndex={isActive ? 0 : -1}
            onClick={() => !item.disabled && handleSelect(item.key)}
            onKeyDown={(e) => handleKeyDown(e, i)}
            className={cn(
              'inline-flex items-center gap-2 text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] rounded-[var(--radius-sm)]',
              'disabled:opacity-40 disabled:cursor-not-allowed',
              variant === 'line' && [
                'px-4 py-2.5 border-b-2 -mb-px rounded-none',
                isActive
                  ? 'border-[var(--color-primary)] text-[var(--color-primary)]'
                  : 'border-transparent text-[var(--color-fg-muted)] hover:text-[var(--color-fg-base)] hover:border-[var(--color-border)]',
              ],
              variant === 'pill' && [
                'px-3 py-1.5 rounded-[var(--radius-md)]',
                isActive
                  ? 'bg-[var(--color-bg-surface)] text-[var(--color-fg-base)] shadow-[var(--shadow-sm)]'
                  : 'text-[var(--color-fg-muted)] hover:text-[var(--color-fg-base)]',
              ]
            )}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

export interface TabPanelProps {
  tabKey: string;
  activeKey: string;
  children: React.ReactNode;
  className?: string;
}

export function TabPanel({ tabKey, activeKey, children, className }: TabPanelProps) {
  const isActive = tabKey === activeKey;
  return (
    <div
      role="tabpanel"
      hidden={!isActive}
      tabIndex={0}
      className={cn('focus-visible:outline-none', className)}
    >
      {isActive && children}
    </div>
  );
}
