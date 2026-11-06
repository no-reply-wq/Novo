'use client';

import React, { useState, useCallback } from 'react';

export interface ConvertToButtonProps {
  /** ID of the ConvertToConfig in the database */
  configId: string;
  /** The record(s) to convert from */
  sourceRecordIds: string[];
  tenantSlug: string;
  /** Button label */
  label?: string;
  /** Called with the new record ID after a successful conversion */
  onSuccess?: (createdRecordId: string) => void;
}

interface ConvertToResult {
  createdRecordId: string;
  lines: number;
}

const S = {
  btn: (loading: boolean, done: boolean): React.CSSProperties => ({
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '8px 16px',
    borderRadius: 6,
    border: 'none',
    cursor: loading ? 'not-allowed' : 'pointer',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    fontSize: 13,
    fontWeight: 600,
    background: done ? '#16a34a' : loading ? '#6b7280' : '#2563eb',
    color: '#fff',
    transition: 'background 0.15s',
    opacity: loading ? 0.75 : 1,
  }),
  spinner: {
    width: 14,
    height: 14,
    border: '2px solid rgba(255,255,255,0.4)',
    borderTopColor: '#fff',
    borderRadius: '50%',
    animation: 'spin 0.6s linear infinite',
    flexShrink: 0,
  } as React.CSSProperties,
  toast: (err: boolean): React.CSSProperties => ({
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
    padding: '6px 12px',
    borderRadius: 6,
    fontSize: 12,
    fontFamily: 'system-ui, -apple-system, sans-serif',
    background: err ? '#fef2f2' : '#f0fdf4',
    color: err ? '#b91c1c' : '#15803d',
    border: `1px solid ${err ? '#fecaca' : '#bbf7d0'}`,
  }),
};

const keyframes = `@keyframes spin { to { transform: rotate(360deg); } }`;

export function ConvertToButton({
  configId,
  sourceRecordIds,
  tenantSlug,
  label = 'Convert',
  onSuccess,
}: ConvertToButtonProps) {
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdId, setCreatedId] = useState<string | null>(null);

  const handleClick = useCallback(async () => {
    if (loading || done) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(
        `/api/runtime/${encodeURIComponent(tenantSlug)}/stock/convert-to`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ configId, sourceRecordIds }),
        },
      );

      const body = await res.json() as ConvertToResult & { error?: string };

      if (!res.ok) {
        setError(body.error ?? `Server error (${res.status})`);
        return;
      }

      setCreatedId(body.createdRecordId);
      setDone(true);
      onSuccess?.(body.createdRecordId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [loading, done, tenantSlug, configId, sourceRecordIds, onSuccess]);

  const disabled = loading || done || sourceRecordIds.length === 0;

  return (
    <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}>
      <style>{keyframes}</style>
      <button
        style={S.btn(loading, done)}
        disabled={disabled}
        onClick={() => { void handleClick(); }}
        type="button"
      >
        {loading && <span style={S.spinner} />}
        {done ? '✓ Converted' : label}
      </button>

      {done && createdId && (
        <span style={S.toast(false)}>
          Created record <code style={{ fontFamily: 'monospace' }}>{createdId}</code>
        </span>
      )}

      {error && (
        <span style={S.toast(true)}>
          {error}
        </span>
      )}
    </div>
  );
}
