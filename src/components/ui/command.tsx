'use client';
<<<<<<< HEAD

=======
>>>>>>> 4d81d88 (feat(design): Wave 1 design system — tokens, Tailwind config, new UI components)
import * as React from 'react';
import { Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface CommandItem {
<<<<<<< HEAD
  key: string;
  label: string;
  description?: string;
  icon?: React.ReactNode;
  shortcut?: string;
  group?: string;
  onSelect?: () => void;
}

export interface CommandPaletteProps {
  items: CommandItem[];
  placeholder?: string;
  open: boolean;
  onClose: () => void;
  className?: string;
}

export function CommandPalette({
  items,
  placeholder = 'Search commands…',
  open,
  onClose,
  className,
}: CommandPaletteProps) {
=======
  key: string; label: string; description?: string; icon?: React.ReactNode;
  shortcut?: string; group?: string; onSelect?: () => void;
}
export interface CommandPaletteProps {
  items: CommandItem[]; placeholder?: string; open: boolean; onClose: () => void; className?: string;
}

export function CommandPalette({ items, placeholder = 'Search commands…', open, onClose, className }: CommandPaletteProps) {
>>>>>>> 4d81d88 (feat(design): Wave 1 design system — tokens, Tailwind config, new UI components)
  const [query, setQuery] = React.useState('');
  const [activeIdx, setActiveIdx] = React.useState(0);
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
<<<<<<< HEAD
    if (open) {
      setQuery('');
      setActiveIdx(0);
      setTimeout(() => inputRef.current?.focus(), 10);
    }
=======
    if (open) { setQuery(''); setActiveIdx(0); setTimeout(() => inputRef.current?.focus(), 10); }
>>>>>>> 4d81d88 (feat(design): Wave 1 design system — tokens, Tailwind config, new UI components)
  }, [open]);

  const filtered = React.useMemo(() => {
    const q = query.toLowerCase();
<<<<<<< HEAD
    return q
      ? items.filter(
          (i) =>
            i.label.toLowerCase().includes(q) ||
            i.description?.toLowerCase().includes(q)
        )
      : items;
  }, [items, query]);

  // Group items
  const groups = React.useMemo(() => {
    const map = new Map<string, CommandItem[]>();
    filtered.forEach((item) => {
      const g = item.group ?? '';
      if (!map.has(g)) map.set(g, []);
      map.get(g)!.push(item);
    });
    return map;
  }, [filtered]);

  const flatFiltered = filtered;

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, flatFiltered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      flatFiltered[activeIdx]?.onSelect?.();
      onClose();
    }
  };

  if (!open) return null;

  let flatIdx = 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" />

      <div
        className={cn(
          'relative z-10 w-full max-w-lg rounded-[var(--radius-lg)] border border-[var(--color-border)]',
          'bg-[var(--color-bg-surface)] shadow-[var(--shadow-lg)] overflow-hidden',
          className
        )}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKey}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 border-b border-[var(--color-border)]">
          <Search size={16} className="text-[var(--color-fg-muted)] shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActiveIdx(0);
            }}
            placeholder={placeholder}
            className="flex-1 h-12 bg-transparent text-sm text-[var(--color-fg-base)] placeholder:text-[var(--color-fg-muted)] outline-none"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="text-[var(--color-fg-muted)] hover:text-[var(--color-fg-base)]"
              aria-label="Clear search"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* Results */}
        <div className="max-h-72 overflow-y-auto py-2" role="listbox">
          {filtered.length === 0 ? (
            <p className="py-8 text-center text-sm text-[var(--color-fg-muted)]">
              No results for &quot;{query}&quot;
            </p>
          ) : (
            Array.from(groups.entries()).map(([group, groupItems]) => (
              <div key={group || '_default'}>
                {group && (
                  <p className="px-4 py-1.5 text-xs font-semibold text-[var(--color-fg-muted)] uppercase tracking-wide">
                    {group}
                  </p>
                )}
                {groupItems.map((item) => {
                  const idx = flatIdx++;
                  const isActive = idx === activeIdx;
                  return (
                    <button
                      key={item.key}
                      role="option"
                      aria-selected={isActive}
                      onClick={() => {
                        item.onSelect?.();
                        onClose();
                      }}
                      onMouseEnter={() => setActiveIdx(idx)}
                      className={cn(
                        'w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left transition-colors',
                        isActive
                          ? 'bg-[var(--color-primary)] text-white'
                          : 'text-[var(--color-fg-base)] hover:bg-[var(--color-bg-muted)]'
                      )}
                    >
                      {item.icon && (
                        <span className={cn('shrink-0', isActive ? 'text-white' : 'text-[var(--color-fg-muted)]')}>
                          {item.icon}
                        </span>
                      )}
                      <span className="flex-1 font-medium">{item.label}</span>
                      {item.description && (
                        <span
                          className={cn(
                            'text-xs',
                            isActive ? 'text-white/70' : 'text-[var(--color-fg-muted)]'
                          )}
                        >
                          {item.description}
                        </span>
                      )}
                      {item.shortcut && (
                        <kbd
                          className={cn(
                            'text-xs px-1.5 py-0.5 rounded border font-mono',
                            isActive
                              ? 'bg-white/20 border-white/30 text-white'
                              : 'bg-[var(--color-bg-muted)] border-[var(--color-border)] text-[var(--color-fg-muted)]'
                          )}
                        >
                          {item.shortcut}
                        </kbd>
                      )}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>

        {/* Footer hint */}
        <div className="flex items-center gap-4 px-4 py-2 border-t border-[var(--color-border)] text-xs text-[var(--color-fg-muted)]">
          <span><kbd className="font-mono">↑↓</kbd> navigate</span>
          <span><kbd className="font-mono">↵</kbd> select</span>
=======
    return q ? items.filter(i => i.label.toLowerCase().includes(q) || i.description?.toLowerCase().includes(q)) : items;
  }, [items, query]);

  const groups = React.useMemo(() => {
    const map = new Map<string, CommandItem[]>();
    filtered.forEach(item => { const g = item.group ?? ''; if (!map.has(g)) map.set(g, []); map.get(g)!.push(item); });
    return map;
  }, [filtered]);

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
    else if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx(i => Math.min(i + 1, filtered.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIdx(i => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter') { filtered[activeIdx]?.onSelect?.(); onClose(); }
  };

  if (!open) return null;
  let fi = 0;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]" onClick={onClose} role="dialog" aria-modal="true" aria-label="Command palette">
      <div className="absolute inset-0 bg-black/40" />
      <div className={cn('relative z-10 w-full max-w-lg rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-surface)] shadow-[var(--shadow-lg)] overflow-hidden', className)}
        onClick={e => e.stopPropagation()} onKeyDown={handleKey}>
        <div className="flex items-center gap-3 px-4 border-b border-[var(--color-border)]">
          <Search size={16} className="text-[var(--color-fg-muted)] shrink-0" />
          <input ref={inputRef} type="text" value={query} onChange={e => { setQuery(e.target.value); setActiveIdx(0); }}
            placeholder={placeholder} className="flex-1 h-12 bg-transparent text-sm text-[var(--color-fg-base)] placeholder:text-[var(--color-fg-muted)] outline-none" />
          {query && <button onClick={() => setQuery('')} className="text-[var(--color-fg-muted)] hover:text-[var(--color-fg-base)]" aria-label="Clear"><X size={14} /></button>}
        </div>
        <div className="max-h-72 overflow-y-auto py-2" role="listbox">
          {filtered.length === 0 ? (
            <p className="py-8 text-center text-sm text-[var(--color-fg-muted)]">No results for &ldquo;{query}&rdquo;</p>
          ) : Array.from(groups.entries()).map(([group, gi]) => (
            <div key={group || '_'}>
              {group && <p className="px-4 py-1.5 text-xs font-semibold text-[var(--color-fg-muted)] uppercase tracking-wide">{group}</p>}
              {gi.map(item => {
                const idx = fi++; const ia = idx === activeIdx;
                return (
                  <button key={item.key} role="option" aria-selected={ia}
                    onClick={() => { item.onSelect?.(); onClose(); }} onMouseEnter={() => setActiveIdx(idx)}
                    className={cn('w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left',
                      ia ? 'bg-[var(--color-primary)] text-white' : 'text-[var(--color-fg-base)] hover:bg-[var(--color-bg-muted)]')}>
                    {item.icon && <span className={cn('shrink-0', ia ? 'text-white' : 'text-[var(--color-fg-muted)]')}>{item.icon}</span>}
                    <span className="flex-1 font-medium">{item.label}</span>
                    {item.description && <span className={cn('text-xs', ia ? 'text-white/70' : 'text-[var(--color-fg-muted)]')}>{item.description}</span>}
                    {item.shortcut && <kbd className={cn('text-xs px-1.5 py-0.5 rounded border font-mono', ia ? 'bg-white/20 border-white/30 text-white' : 'bg-[var(--color-bg-muted)] border-[var(--color-border)] text-[var(--color-fg-muted)]')}>{item.shortcut}</kbd>}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
        <div className="flex gap-4 px-4 py-2 border-t border-[var(--color-border)] text-xs text-[var(--color-fg-muted)]">
          <span><kbd className="font-mono">&#x2191;&#x2193;</kbd> navigate</span>
          <span><kbd className="font-mono">&#x23CE;</kbd> select</span>
>>>>>>> 4d81d88 (feat(design): Wave 1 design system — tokens, Tailwind config, new UI components)
          <span><kbd className="font-mono">Esc</kbd> close</span>
        </div>
      </div>
    </div>
  );
}

<<<<<<< HEAD
/** Hook — press Cmd+K / Ctrl+K to toggle the palette */
export function useCommandPalette() {
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  return { open, setOpen, toggle: () => setOpen((v) => !v) };
=======
export function useCommandPalette() {
  const [open, setOpen] = React.useState(false);
  React.useEffect(() => {
    const h = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); setOpen(v => !v); } };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);
  return { open, setOpen, toggle: () => setOpen(v => !v) };
>>>>>>> 4d81d88 (feat(design): Wave 1 design system — tokens, Tailwind config, new UI components)
}
