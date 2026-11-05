'use client';

import * as React from 'react';
import { Upload, X, File, Image } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface FileUploadFile {
  id: string;
  file: File;
  preview?: string;
  error?: string;
}

export interface FileUploadProps {
  accept?: string;
  multiple?: boolean;
  maxSize?: number; // bytes
  maxFiles?: number;
  onFilesChange?: (files: FileUploadFile[]) => void;
  label?: string;
  hint?: string;
  error?: string;
  disabled?: boolean;
  className?: string;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

export function FileUpload({
  accept,
  multiple = false,
  maxSize,
  maxFiles,
  onFilesChange,
  label = 'Drop files here or click to upload',
  hint,
  error: externalError,
  disabled,
  className,
}: FileUploadProps) {
  const [files, setFiles] = React.useState<FileUploadFile[]>([]);
  const [dragging, setDragging] = React.useState(false);
  const [internalError, setInternalError] = React.useState('');
  const inputRef = React.useRef<HTMLInputElement>(null);
  const error = externalError || internalError;

  const processFiles = (incoming: File[]) => {
    setInternalError('');
    const limited = maxFiles ? incoming.slice(0, maxFiles - files.length) : incoming;
    const processed: FileUploadFile[] = limited.map((f) => {
      const id = `${f.name}-${f.lastModified}-${Math.random()}`;
      const fileError = maxSize && f.size > maxSize
        ? `File too large (max ${formatBytes(maxSize)})`
        : undefined;
      const preview = !fileError && f.type.startsWith('image/') ? URL.createObjectURL(f) : undefined;
      return { id, file: f, preview, error: fileError };
    });
    const next = multiple ? [...files, ...processed] : processed;
    setFiles(next);
    onFilesChange?.(next);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (disabled) return;
    processFiles(Array.from(e.dataTransfer.files));
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) processFiles(Array.from(e.target.files));
    e.target.value = '';
  };

  const removeFile = (id: string) => {
    const next = files.filter((f) => f.id !== id);
    setFiles(next);
    onFilesChange?.(next);
  };

  return (
    <div className={cn('space-y-3', className)}>
      <div
        onDragOver={(e) => { e.preventDefault(); if (!disabled) setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => !disabled && inputRef.current?.click()}
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-label="Upload files"
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inputRef.current?.click(); } }}
        className={cn(
          'flex flex-col items-center justify-center gap-3 p-8 rounded-[var(--radius-lg)] border-2 border-dashed cursor-pointer transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]',
          dragging
            ? 'border-[var(--color-primary)] bg-[color-mix(in_srgb,var(--color-primary)_6%,transparent)]'
            : error
              ? 'border-[var(--color-danger)]'
              : 'border-[var(--color-border)] hover:border-[var(--color-primary)] hover:bg-[var(--color-bg-muted)]',
          disabled && 'opacity-50 cursor-not-allowed'
        )}
      >
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          multiple={multiple}
          disabled={disabled}
          onChange={handleChange}
          className="sr-only"
        />
        <Upload
          size={24}
          className={cn(dragging ? 'text-[var(--color-primary)]' : 'text-[var(--color-fg-muted)]')}
        />
        <div className="text-center">
          <p className="text-sm font-medium text-[var(--color-fg-base)]">{label}</p>
          {hint && <p className="text-xs text-[var(--color-fg-muted)] mt-1">{hint}</p>}
          {accept && (
            <p className="text-xs text-[var(--color-fg-muted)] mt-0.5">
              Accepted: {accept.replace(/,/g, ', ')}
            </p>
          )}
          {maxSize && (
            <p className="text-xs text-[var(--color-fg-muted)] mt-0.5">Max size: {formatBytes(maxSize)}</p>
          )}
        </div>
      </div>

      {error && <p role="alert" className="text-xs text-[var(--color-danger)]">{error}</p>}

      {files.length > 0 && (
        <ul className="space-y-2">
          {files.map((f) => (
            <li
              key={f.id}
              className={cn(
                'flex items-center gap-3 p-3 rounded-[var(--radius-md)] border',
                f.error
                  ? 'border-[var(--color-danger)] bg-[color-mix(in_srgb,var(--color-danger)_6%,transparent)]'
                  : 'border-[var(--color-border)] bg-[var(--color-bg-surface)]'
              )}
            >
              {f.preview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={f.preview} alt="" className="w-10 h-10 object-cover rounded-[var(--radius-sm)] flex-shrink-0" />
              ) : (
                <div className="w-10 h-10 rounded-[var(--radius-sm)] bg-[var(--color-bg-muted)] flex items-center justify-center flex-shrink-0">
                  {f.file.type.startsWith('image/') ? (
                    <Image size={16} className="text-[var(--color-fg-muted)]" />
                  ) : (
                    <File size={16} className="text-[var(--color-fg-muted)]" />
                  )}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-[var(--color-fg-base)] truncate">{f.file.name}</p>
                {f.error ? (
                  <p className="text-xs text-[var(--color-danger)]">{f.error}</p>
                ) : (
                  <p className="text-xs text-[var(--color-fg-muted)]">{formatBytes(f.file.size)}</p>
                )}
              </div>
              <button
                onClick={() => removeFile(f.id)}
                aria-label={`Remove ${f.file.name}`}
                className="p-1 rounded text-[var(--color-fg-muted)] hover:text-[var(--color-danger)] transition-colors"
              >
                <X size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
