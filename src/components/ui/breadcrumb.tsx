'use client';

import * as React from 'react';
import { ChevronRight, MoreHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface BreadcrumbItem {
  key: string;
  label: React.ReactNode;
  href?: string;
  onClick?: () => void;
}

export interface BreadcrumbProps {
  items: BreadcrumbItem[];
  maxItems?: number;
  className?: string;
  separator?: React.ReactNode;
}

export function Breadcrumb({
  items,
  maxItems = 4,
  className,
  separator = <ChevronRight size={12} className="text-[var(--color-fg-muted)]" />,
}: BreadcrumbProps) {
  const [expanded, setExpanded] = React.useState(false);

  const shouldCollapse = !expanded && items.length > maxItems;
  const displayItems = shouldCollapse
    ? [
        items[0],
        { key: '__ellipsis__', label: null } as BreadcrumbItem,
        ...items.slice(-(Math.ceil(maxItems / 2))),
      ]
    : items;

  return (
    <nav aria-label="Breadcrumb">
      <ol className={cn('flex items-center gap-1.5 flex-wrap', className)}>
        {displayItems.map((item, i) => {
          const isLast = i === displayItems.length - 1;
          const isEllipsis = item.key === '__ellipsis__';

          return (
            <React.Fragment key={item.key}>
              <li className="flex items-center">
                {isEllipsis ? (
                  <button
                    onClick={() => setExpanded(true)}
                    aria-label="Show all breadcrumbs"
                    className={cn(
                      'p-1 rounded text-[var(--color-fg-muted)] hover:text-[var(--color-fg-base)] hover:bg-[var(--color-bg-muted)] transition-colors',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]'
                    )}
                  >
                    <MoreHorizontal size={14} />
                  </button>
                ) : (
                  <span
                    aria-current={isLast ? 'page' : undefined}
                    className={cn(
                      'text-sm',
                      isLast
                        ? 'font-medium text-[var(--color-fg-base)]'
                        : 'text-[var(--color-fg-muted)]'
                    )}
                  >
                    {item.href ? (
                      <a
                        href={item.href}
                        className={cn(
                          'hover:text-[var(--color-fg-base)] transition-colors',
                          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] rounded'
                        )}
                      >
                        {item.label}
                      </a>
                    ) : item.onClick ? (
                      <button
                        onClick={item.onClick}
                        className={cn(
                          'hover:text-[var(--color-fg-base)] transition-colors',
                          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] rounded'
                        )}
                      >
                        {item.label}
                      </button>
                    ) : (
                      item.label
                    )}
                  </span>
                )}
              </li>
              {!isLast && (
                <li role="separator" aria-hidden="true">
                  {separator}
                </li>
              )}
            </React.Fragment>
          );
        })}
      </ol>
    </nav>
  );
}
