'use client';

import React, { useState, useEffect, useCallback } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface MaterialAvailability {
  componentId: string;
  componentName: string;
  requiredQty: number;
  availableQty: number;
  shortage: number;
  hasSubstitute: boolean;
}

interface WorkOrder {
  id: string;
  bomId: string;
  productId: string;
  targetQty: number;
  unit: string;
  status: string;
  createdAt: string;
}

type AvailabilityState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'done'; hasShortage: boolean; availability: MaterialAvailability[] }
  | { status: 'error'; message: string };

type WorkOrderState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'done'; workOrder: WorkOrder }
  | { status: 'error'; message: string };

// ─── Props ────────────────────────────────────────────────────────────────────

export interface BOMWidgetProps {
  tenantSlug: string;
  appId: string;
  bomId: string;
  targetQty: number;
  locationId?: string;
}

// ─── BOMWidget ────────────────────────────────────────────────────────────────

export function BOMWidget({
  tenantSlug,
  appId,
  bomId,
  targetQty,
  locationId = '',
}: BOMWidgetProps) {
  const [availState, setAvailState] = useState<AvailabilityState>({ status: 'idle' });
  const [woState, setWoState] = useState<WorkOrderState>({ status: 'idle' });

  const checkAvailability = useCallback(async () => {
    if (!bomId || targetQty <= 0) return;

    setAvailState({ status: 'loading' });
    try {
      const params = new URLSearchParams({
        targetQty: String(targetQty),
        locationId,
      });

      const res = await fetch(
        `/api/runtime/${tenantSlug}/boms/${bomId}/availability?${params.toString()}`
      );

      const data = (await res.json()) as {
        hasShortage?: boolean;
        availability?: MaterialAvailability[];
        error?: string;
      };

      if (!res.ok) {
        setAvailState({ status: 'error', message: data.error ?? 'Failed to check availability' });
        return;
      }

      setAvailState({
        status: 'done',
        hasShortage: data.hasShortage ?? false,
        availability: data.availability ?? [],
      });
    } catch {
      setAvailState({ status: 'error', message: 'Network error. Please try again.' });
    }
  }, [bomId, targetQty, locationId, tenantSlug]);

  useEffect(() => {
    void checkAvailability();
  }, [checkAvailability]);

  const createWorkOrder = async () => {
    setWoState({ status: 'loading' });
    try {
      const res = await fetch(`/api/runtime/${tenantSlug}/boms/${bomId}/work-order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appId, targetQty }),
      });

      const data = (await res.json()) as { workOrder?: WorkOrder; error?: string };

      if (!res.ok) {
        setWoState({ status: 'error', message: data.error ?? 'Failed to create work order' });
        return;
      }

      setWoState({ status: 'done', workOrder: data.workOrder! });
    } catch {
      setWoState({ status: 'error', message: 'Network error. Please try again.' });
    }
  };

  if (!bomId) {
    return (
      <div className="rounded border border-dashed border-gray-300 p-4 text-sm text-gray-400">
        BOM Widget — no bomId configured
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Material Requirements</h3>
          <p className="text-xs text-gray-500">
            Target: {targetQty} units
          </p>
        </div>
        <button
          onClick={() => void checkAvailability()}
          className="text-xs text-indigo-600 hover:underline"
        >
          Refresh
        </button>
      </div>

      {/* Availability */}
      <div className="p-4">
        {availState.status === 'idle' && (
          <p className="text-xs text-gray-400">Checking material availability…</p>
        )}

        {availState.status === 'loading' && (
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <span className="inline-block h-3 w-3 animate-spin rounded-full border border-gray-300 border-t-indigo-500" />
            Checking availability…
          </div>
        )}

        {availState.status === 'error' && (
          <div className="rounded bg-red-50 p-2 text-xs text-red-600">
            {availState.message}
          </div>
        )}

        {availState.status === 'done' && (
          <>
            {/* Shortage alert */}
            {availState.hasShortage && (
              <div className="mb-3 rounded bg-amber-50 p-2 text-xs font-medium text-amber-700">
                Material shortage detected — some components are insufficient for this production run.
              </div>
            )}

            {!availState.hasShortage && (
              <div className="mb-3 rounded bg-green-50 p-2 text-xs font-medium text-green-700">
                All materials available for {targetQty} units.
              </div>
            )}

            {/* Component table */}
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="pb-1 text-left font-medium text-gray-500">Component</th>
                    <th className="pb-1 text-right font-medium text-gray-500">Required</th>
                    <th className="pb-1 text-right font-medium text-gray-500">Available</th>
                    <th className="pb-1 text-center font-medium text-gray-500">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {availState.availability.map((item) => {
                    const ok = item.shortage === 0;
                    return (
                      <tr key={item.componentId}>
                        <td className="py-1 pr-2">
                          <span className="font-medium text-gray-800">{item.componentName}</span>
                          <span className="ml-1 text-gray-400">({item.componentId})</span>
                          {item.hasSubstitute && (
                            <span className="ml-1 text-indigo-500">[sub available]</span>
                          )}
                        </td>
                        <td className="py-1 text-right text-gray-700">
                          {item.requiredQty.toFixed(3)}
                        </td>
                        <td className={`py-1 text-right ${ok ? 'text-gray-700' : 'text-red-600 font-medium'}`}>
                          {item.availableQty.toFixed(3)}
                        </td>
                        <td className="py-1 text-center">
                          {ok ? (
                            <span className="inline-block rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                              OK
                            </span>
                          ) : (
                            <span className="inline-block rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-600">
                              Short {item.shortage.toFixed(3)}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* Work order creation */}
      <div className="border-t border-gray-100 px-4 py-3">
        {woState.status === 'idle' && (
          <button
            onClick={() => void createWorkOrder()}
            className="w-full rounded bg-indigo-600 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            disabled={availState.status !== 'done'}
          >
            Create Work Order
          </button>
        )}

        {woState.status === 'loading' && (
          <div className="flex items-center justify-center gap-2 py-1.5 text-xs text-gray-400">
            <span className="inline-block h-3 w-3 animate-spin rounded-full border border-gray-300 border-t-indigo-500" />
            Creating work order…
          </div>
        )}

        {woState.status === 'done' && (
          <div className="rounded bg-indigo-50 p-2 text-xs">
            <p className="font-medium text-indigo-800">
              Work Order created: <span className="font-mono">{woState.workOrder.id.slice(0, 8)}…</span>
            </p>
            <p className="text-indigo-600">
              Status: {woState.workOrder.status} · {woState.workOrder.targetQty} {woState.workOrder.unit}
            </p>
            <button
              onClick={() => setWoState({ status: 'idle' })}
              className="mt-1 text-indigo-500 hover:underline"
            >
              Create another
            </button>
          </div>
        )}

        {woState.status === 'error' && (
          <div className="rounded bg-red-50 p-2 text-xs text-red-600">
            {woState.message}
            <button
              onClick={() => setWoState({ status: 'idle' })}
              className="ml-2 underline"
            >
              Retry
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
