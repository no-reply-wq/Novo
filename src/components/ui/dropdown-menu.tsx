'use client';

import * as React from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface DropdownMenuItem {
  key: string;
  label: React.ReactNode;
  icon?: React.ReactNode;
  shortcut?: string;
  disabled?: boolean;
  danger?: boolean;
  onClick?: () => void;
  children?: DropdownMenuItem[];
}

export interface DropdownMenuSeparator {
  type: 'separator';
  key: string;
}

export type DropdownMenuEntry = DropdownMenuItem | DropdownMenuSeparator;

export interface DropdownMenuProps {
  trigger: React.ReactElement;
  items: DropdownMenuEntry[];
  align?: 'start' | 'end';
  className?: string;
}

function isSeparator(entry: DropdownMenuEntry): entry is DropdownMenuSeparator {
  return (entry as DropdownMenuSeparator).type === 'separator';
}

export function DropdownMenu({ trigger, items, align = 'start', className }: DropdownMenuProps) {
  const [open, setOpen] = React.useState(false);
  const [coords, setCoords] = React.useState({ top: 0, left: 0 });
  const [activeIndex, setActiveIndex] = React.useState(-1);
  const triggerRef = React.useRef<HTMLElement>(null);
  const menuRef = React.useRef<HTMLDivElement>(null);
  const menuId = React.useId();

  const enabledItems = items.filter(
    (i): i is DropdownMenuItem => !isSeparator(i) && !i.disabled
  );

  const toggleOpen = () => {
    if (!open) {
      const el = triggerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      setCoords({
        top: rect.bottom + window.scrollY + 4,
        left: align === 'end' ? rect.right + window.scrollX : rect.left + window.scrollX,
      });
      setActiveIndex(-1);
    }
    setOpen((o) => !o);
  };

  React.useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node) && !triggerRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { setOpen(false); triggerRef.current?.focus(); return; }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % enabledItems.length);
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => (i - 1 + enabledItems.length) % enabledItems.length);
    }
    if (e.key === 'Enter' && activeIndex >= 0) {
      enabledItems[activeIndex]?.onClick?.();
      setOpen(false);
    }
  };

  const triggerProps = trigger.props as React.HTMLAttributes<HTMLElement>;
  const child = React.cloneElement(trigger, {
    ref: triggerRef,
    onClick: (e: React.MouseEvent<HTMLElement>) => { toggleOpen(); triggerProps.onClick?.(e); },
    'aria-haspopup': 'menu',
    'aria-expanded': open,
    'aria-controls': open ? menuId : undefined,
  } as React.HTMLAttributes<HTMLElement>);

  const transformX = align === 'end' ? 'translate(-100%, 0)' : 'translate(0, 0)';

  return (
    <>
      {child}
      {open && typeof document !== 'undefined' && createPortal(
        <div
          id={menuId}
          ref={menuRef}
          role="menu"
          aria-orientation="vertical"
          onKeyDown={handleKeyDown}
          tabIndex={-1}
          style={{
            position: 'absolute',
            top: coords.top,
            left: coords.left,
            transform: transformX,
            zIndex: 9000,
          }}
          className={cn(
            'min-w-[180px] py-1 rounded-[var(--radius-lg)] bg-[var(--color-bg-surface)] border border-[var(--color-border)] shadow-[var(--shadow-lg)]',
            className
          )}
        >
          {items.map((entry, i) => {
            if (isSeparator(entry)) {
              return (
                <div
                  key={entry.key}
                  role="separator"
                  className="my-1 h-px bg-[var(--color-border)]"
                />
              );
            }
            const item = entry;
            const isActive = activeIndex === enabledItems.indexOf(item);
            return (
              <button
                key={item.key}
                role="menuitem"
                disabled={item.disabled}
                tabIndex={-1}
                onClick={() => { item.onClick?.(); setOpen(false); }}
                onMouseEnter={() => setActiveIndex(enabledItems.indexOf(item))}
                className={cn(
                  'w-full flex items-center gap-2.5 px-3 py-1.5 text-sm text-left transition-colors',
                  'disabled:opacity-40 disabled:cursor-not-allowed',
                  item.danger
                    ? 'text-[var(--color-danger)] hover:bg-[color-mix(in_srgb,var(--color-danger)_8%,transparent)]'
                    : 'text-[var(--color-fg-base)] hover:bg-[var(--color-bg-muted)]',
                  isActive && 'bg-[var(--color-bg-muted)]'
                )}
              >
                {item.icon && <span className="w-4 h-4 flex-shrink-0 text-[var(--color-fg-muted)]">{item.icon}</span>}
                <span className="flex-1">{item.label}</span>
                {item.shortcut && (
                  <span className="text-xs text-[var(--color-fg-muted)] ml-auto">{item.shortcut}</span>
                )}
                {item.children && <ChevronRight size={14} className="text-[var(--color-fg-muted)]" />}
              </button>
            );
          })}
        </div>,
        document.body
      )}
    </>
  );
}
