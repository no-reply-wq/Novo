'use client';

import * as React from 'react';
import { Bold, Italic, Underline, List, ListOrdered, Link, Strikethrough } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface RichTextProps {
  value?: string;
  defaultValue?: string;
  onChange?: (html: string) => void;
  label?: string;
  placeholder?: string;
  error?: string;
  hint?: string;
  disabled?: boolean;
  minHeight?: number;
  className?: string;
  wrapperClassName?: string;
}

interface ToolbarButton {
  command: string;
  icon: React.ReactNode;
  title: string;
  value?: string;
}

export function RichText({
  value: controlledValue,
  defaultValue = '',
  onChange,
  label,
  placeholder = 'Write something…',
  error,
  hint,
  disabled,
  minHeight = 120,
  className,
  wrapperClassName,
}: RichTextProps) {
  const editorRef = React.useRef<HTMLDivElement>(null);
  const [focused, setFocused] = React.useState(false);
  const generatedId = React.useId();
  const errorId = `${generatedId}-error`;
  const editorId = `${generatedId}-editor`;

  // Set initial content
  React.useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    const initial = controlledValue ?? defaultValue;
    if (el.innerHTML !== initial) el.innerHTML = initial;
  }, []);

  const exec = (command: string, value?: string) => {
    if (disabled) return;
    editorRef.current?.focus();
    document.execCommand(command, false, value);
    handleChange();
  };

  const handleChange = () => {
    onChange?.(editorRef.current?.innerHTML ?? '');
  };

  const handleLinkInsert = () => {
    const url = window.prompt('Enter URL');
    if (url) exec('createLink', url);
  };

  const tools: ToolbarButton[] = [
    { command: 'bold', icon: <Bold size={14} />, title: 'Bold (Ctrl+B)' },
    { command: 'italic', icon: <Italic size={14} />, title: 'Italic (Ctrl+I)' },
    { command: 'underline', icon: <Underline size={14} />, title: 'Underline (Ctrl+U)' },
    { command: 'strikeThrough', icon: <Strikethrough size={14} />, title: 'Strikethrough' },
    { command: 'insertUnorderedList', icon: <List size={14} />, title: 'Bullet list' },
    { command: 'insertOrderedList', icon: <ListOrdered size={14} />, title: 'Numbered list' },
  ];

  return (
    <div className={cn('space-y-1', wrapperClassName)}>
      {label && (
        <label htmlFor={editorId} className="block text-sm font-medium text-[var(--color-fg-base)]">
          {label}
        </label>
      )}
      <div
        className={cn(
          'rounded-[var(--radius-md)] border overflow-hidden transition-colors',
          focused
            ? 'ring-2 ring-[var(--color-primary)] border-[var(--color-primary)]'
            : error
              ? 'border-[var(--color-danger)]'
              : 'border-[var(--color-border)]',
          disabled && 'opacity-50 cursor-not-allowed'
        )}
      >
        {/* Toolbar */}
        <div className="flex items-center gap-0.5 p-1.5 border-b border-[var(--color-border)] bg-[var(--color-bg-muted)]">
          {tools.map((tool) => (
            <button
              key={tool.command}
              type="button"
              title={tool.title}
              aria-label={tool.title}
              disabled={disabled}
              onMouseDown={(e) => { e.preventDefault(); exec(tool.command, tool.value); }}
              className={cn(
                'p-1.5 rounded text-[var(--color-fg-muted)] hover:bg-[var(--color-bg-surface)] hover:text-[var(--color-fg-base)] transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]',
                'disabled:cursor-not-allowed disabled:opacity-40'
              )}
            >
              {tool.icon}
            </button>
          ))}
          <div className="w-px h-5 bg-[var(--color-border)] mx-1" />
          <button
            type="button"
            title="Insert link"
            aria-label="Insert link"
            disabled={disabled}
            onMouseDown={(e) => { e.preventDefault(); handleLinkInsert(); }}
            className={cn(
              'p-1.5 rounded text-[var(--color-fg-muted)] hover:bg-[var(--color-bg-surface)] hover:text-[var(--color-fg-base)] transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]'
            )}
          >
            <Link size={14} />
          </button>
        </div>
        {/* Editor */}
        <div
          ref={editorRef}
          id={editorId}
          role="textbox"
          aria-multiline="true"
          aria-label={label ?? 'Rich text editor'}
          aria-describedby={error ? errorId : undefined}
          contentEditable={!disabled}
          suppressContentEditableWarning
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onInput={handleChange}
          data-placeholder={placeholder}
          className={cn(
            'min-h-[var(--rt-min-height)] px-3 py-2.5 text-sm text-[var(--color-fg-base)] bg-[var(--color-bg-base)] focus:outline-none',
            '[&>*]:my-1',
            '[&_a]:text-[var(--color-primary)] [&_a]:underline',
            "[&:empty:before]:content-[attr(data-placeholder)] [&:empty:before]:text-[var(--color-fg-muted)] [&:empty:before]:pointer-events-none",
            disabled && 'cursor-not-allowed bg-[var(--color-bg-muted)]',
            className
          )}
          style={{ '--rt-min-height': `${minHeight}px` } as React.CSSProperties}
        />
      </div>
      {error && <p id={errorId} role="alert" className="text-xs text-[var(--color-danger)]">{error}</p>}
      {hint && !error && <p className="text-xs text-[var(--color-fg-muted)]">{hint}</p>}
    </div>
  );
}
