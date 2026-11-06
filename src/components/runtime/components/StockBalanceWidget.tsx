'use client';

import React, { useEffect, useState } from 'react';

interface StockBalance {
  itemId: string;
  locationId: string;
  batchNo?: string;
  availableQty: number;
  reservedQty: number;
  onOrderQty: number;
}

interface StockBalanceWidgetProps {
  tenantSlug: string;
  itemId: string;
  locationId: string;
  batchNo?: string;
  lowStockThreshold?: number;
}

type StatusLevel = 'ok' | 'low' | 'out';

function getStatus(availableQty: number, threshold?: number): StatusLevel {
  if (availableQty <= 0) return 'out';
  if (threshold !== undefined && availableQty <= threshold) return 'low';
  return 'ok';
}

const statusColors: Record<StatusLevel, string> = {
  ok: 'text-green-700 bg-green-50 border-green-200',
  low: 'text-yellow-700 bg-yellow-50 border-yellow-200',
  out: 'text-red-700 bg-red-50 border-red-200',
};

const statusLabels: Record<StatusLevel, string> = {
  ok: 'In Stock',
  low: 'Low Stock',
  out: 'Out of Stock',
};

export function StockBalanceWidget({
  tenantSlug,
  itemId,
  locationId,
  batchNo,
  lowStockThreshold,
}: StockBalanceWidgetProps) {
  const [balance, setBalance] = useState<StockBalance | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!tenantSlug || !itemId || !locationId) {
      setLoading(false);
      return;
    }

    const params = new URLSearchParams({ itemId, locationId });
    if (batchNo) params.set('batchNo', batchNo);

    fetch(`/api/runtime/${encodeURIComponent(tenantSlug)}/stock/balance?${params.toString()}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<StockBalance>;
      })
      .then((data) => {
        setBalance(data);
        setError(null);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Failed to load');
      })
      .finally(() => setLoading(false));
  }, [tenantSlug, itemId, locationId, batchNo]);

  if (loading) {
    return (
      <div className="rounded border border-gray-200 p-3 text-xs text-gray-400 animate-pulse">
        Loading stock…
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded border border-red-200 bg-red-50 p-3 text-xs text-red-600">
        Error: {error}
      </div>
    );
  }

  if (!balance) {
    return (
      <div className="rounded border border-gray-200 p-3 text-xs text-gray-400">
        No data
      </div>
    );
  }

  const level = getStatus(balance.availableQty, lowStockThreshold);
  const colorClass = statusColors[level];

  return (
    <div className={`rounded border p-3 text-sm ${colorClass}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="font-medium">{statusLabels[level]}</span>
        {batchNo && (
          <span className="text-xs opacity-70">Batch: {batchNo}</span>
        )}
      </div>
      <div className="grid grid-cols-3 gap-2 text-xs">
        <div className="text-center">
          <div className="text-lg font-bold">{balance.availableQty}</div>
          <div className="opacity-70">Available</div>
        </div>
        <div className="text-center">
          <div className="text-lg font-bold">{balance.reservedQty}</div>
          <div className="opacity-70">Reserved</div>
        </div>
        <div className="text-center">
          <div className="text-lg font-bold">{balance.onOrderQty}</div>
          <div className="opacity-70">On Order</div>
        </div>
      </div>
    </div>
  );
}
