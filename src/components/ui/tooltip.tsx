'use client';

import * as React from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';

export interface TooltipProps {
  content: React.ReactNode;
  children: React.ReactElement;
  side?: 'top' | 'right' | 'bottom' | 'left';
  delay?: number;
  className?: string;
}

export function Tooltip({
  content,
  children,
  side = 'top',
  delay = 300,
  className,
}: TooltipProps) {
  const [visible, setVisible] = React.useState(false);
  const [coords, setCoords] = React.useState({ top: 0, left: 0 });
  const triggerRef = React.useRef<HTMLElement>(null);
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const tooltipId = React.useId();

  const show = () => {
    timerRef.current = setTimeout(() => {
      const el = triggerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const GAP = 8;
      let top = 0, left = 0;
      if (side === 'top') {
        top = rect.top + window.scrollY - GAP;
        left = rect.left + window.scrollX + rect.width / 2;
      } else if (side === 'bottom') {
        top = rect.bottom + window.scrollY + GAP;
        left = rect.left + window.scrollX + rect.width / 2;
      } else if (side === 'left') {
        top = rect.top + window.scrollY + rect.height / 2;
        left = rect.left + window.scrollX - GAP;
      } else {
        top = rect.top + window.scrollY + rect.height / 2;
        left = rect.right + window.scrollX + GAP;
      }
      setCoords({ top, left });
      setVisible(true);
    }, delay);
  };

  const hide = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setVisible(false);
  };

  const transformMap = {
    top: 'translate(-50%, -100%)',
    bottom: 'translate(-50%, 0)',
    left: 'translate(-100%, -50%)',
    right: 'translate(0, -50%)',
  };

  const childProps = children.props as React.HTMLAttributes<HTMLElement>;
  const child = React.cloneElement(children, {
    ref: triggerRef,
    'aria-describedby': visible ? tooltipId : undefined,
    onMouseEnter: (e: React.MouseEvent<HTMLElement>) => {
      show();
      childProps.onMouseEnter?.(e);
    },
    onMouseLeave: (e: React.MouseEvent<HTMLElement>) => {
      hide();
      childProps.onMouseLeave?.(e);
    },
    onFocus: (e: React.FocusEvent<HTMLElement>) => {
      show();
      childProps.onFocus?.(e);
    },
    onBlur: (e: React.FocusEvent<HTMLElement>) => {
      hide();
      childProps.onBlur?.(e);
    },
  } as React.HTMLAttributes<HTMLElement>);

  return (
    <>
      {child}
      {visible && typeof document !== 'undefined' &&
        createPortal(
          <div
            id={tooltipId}
            role="tooltip"
            style={{
              position: 'absolute',
              top: coords.top,
              left: coords.left,
              transform: transformMap[side],
              zIndex: 9999,
            }}
            className={cn(
              'pointer-events-none px-2.5 py-1.5 rounded-[var(--radius-sm)] text-xs font-medium',
              'bg-[var(--color-fg-base)] text-[var(--color-bg-base)]',
              'shadow-[var(--shadow-md)]',
              className
            )}
          >
            {content}
          </div>,
          document.body
        )}
    </>
  );
}
