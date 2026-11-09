'use client';

import React, { useState } from 'react';

interface ConvertToButtonProps {
  tenantSlug: string;
  configId: string;
  sourceRecordIds: string[];
  label?: string;
  onSuccess?: (createdRecordId: string) => void;
}

type ButtonState = 'idle' | 'loading' | 'done' | 'error';

export function ConvertToButton({
  tenantSlug,
  configId,
  sourceRecordIds,
  label = 'Convert',
  onSuccess,
}: ConvertToButtonProps) {
  const [state, setState] = useState<ButtonState>('idle');
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleClick = async () => {
    if (state === 'loading' || state === 'done') return;
    if (sourceRecordIds.length === 0) {
      setErrorMsg('No records selected');
      setState('error');
      return;
    }

    setState('loading');
    setErrorMsg(null);

    try {
      const res = await fetch(
        `/api/runtime/${encodeURIComponent(tenantSlug)}/stock/convert-to`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ configId, sourceRecordIds }),
        },
      );

      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }

      const data = (await res.json()) as { createdRecordId: string };
      setCreatedId(data.createdRecordId);
      setState('done');
      onSuccess?.(data.createdRecordId);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Conversion failed');
      setState('error');
    }
  };

  if (state === 'done') {
    return (
      <div className="flex flex-col gap-1">
        <div className="rounded bg-green-100 border border-green-200 px-3 py-2 text-sm text-green-800 flex items-center gap-2">
          <span>Converted</span>
          {createdId && (
            <span className="text-xs text-green-600 font-mono">{createdId}</span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={() => void handleClick()}
        disabled={state === 'loading'}
        className={`
          rounded px-4 py-2 text-sm font-medium transition-colors
          ${state === 'loading'
            ? 'bg-blue-300 text-white cursor-not-allowed'
            : 'bg-blue-600 hover:bg-blue-700 text-white cursor-pointer'
          }
        `}
      >
        {state === 'loading' ? (
          <span className="flex items-center gap-2">
            <span className="inline-block w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
            Converting…
          </span>
        ) : (
          label
        )}
      </button>
      {state === 'error' && errorMsg && (
        <div className="rounded bg-red-50 border border-red-200 px-3 py-1 text-xs text-red-600">
          {errorMsg}
        </div>
      )}
    </div>
  );
}
