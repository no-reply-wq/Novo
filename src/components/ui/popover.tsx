'use client';

import * as React from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';

export interface PopoverProps {
  trigger: React.ReactElement;
  children: React.ReactNode;
  align?: 'start' | 'center' | 'end';
  side?: 'top' | 'bottom';
  className?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function Popover({
  trigger,
  children,
  align = 'start',
  side = 'bottom',
  className,
  open: controlledOpen,
  onOpenChange,
}: PopoverProps) {
  const [internalOpen, setInternalOpen] = React.useState(false);
  const [coords, setCoords] = React.useState({ top: 0, left: 0 });
  const triggerRef = React.useRef<HTMLElement>(null);
  const popoverRef = React.useRef<HTMLDivElement>(null);
  const isOpen = controlledOpen ?? internalOpen;

  const setOpen = (val: boolean) => {
    if (controlledOpen === undefined) setInternalOpen(val);
    onOpenChange?.(val);
  };

  const toggleOpen = () => {
    const el = triggerRef.current;
    if (!el) return;
    if (!isOpen) {
      const rect = el.getBoundingClientRect();
      const GAP = 4;
      let top = side === 'bottom' ? rect.bottom + window.scrollY + GAP : rect.top + window.scrollY - GAP;
      let left = rect.left + window.scrollX;
      if (align === 'end') left = rect.right + window.scrollX;
      if (align === 'center') left = rect.left + window.scrollX + rect.width / 2;
      setCoords({ top, left });
    }
    setOpen(!isOpen);
  };

  // Close on outside click
  React.useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      if (
        !popoverRef.current?.contains(e.target as Node) &&
        !triggerRef.current?.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isOpen]);

  // Close on Escape
  React.useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen]);

  const transformMap = {
    start: 'translate(0, 0)',
    center: 'translate(-50%, 0)',
    end: 'translate(-100%, 0)',
  };

  const triggerProps = trigger.props as React.HTMLAttributes<HTMLElement>;
  const child = React.cloneElement(trigger, {
    ref: triggerRef,
    onClick: (e: React.MouseEvent<HTMLElement>) => {
      toggleOpen();
      triggerProps.onClick?.(e);
    },
    'aria-expanded': isOpen,
    'aria-haspopup': 'dialog',
  } as React.HTMLAttributes<HTMLElement>);

  return (
    <>
      {child}
      {isOpen && typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={popoverRef}
            role="dialog"
            style={{
              position: 'absolute',
              top: coords.top,
              left: coords.left,
              transform: transformMap[align],
              zIndex: 9000,
            }}
            className={cn(
              'min-w-[200px] rounded-[var(--radius-lg)] bg-[var(--color-bg-surface)] border border-[var(--color-border)] shadow-[var(--shadow-lg)] p-4',
              className
            )}
          >
            {children}
          </div>,
          document.body
        )}
    </>
  );
}
