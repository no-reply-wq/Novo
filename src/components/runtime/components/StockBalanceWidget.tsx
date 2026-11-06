'use client';

import React, { useEffect, useState, useCallback } from 'react';

export interface StockBalanceWidgetProps {
  /** Item ID (can be a resolved expression value) */
  itemId: string;
  /** Location ID (can be a resolved expression value) */
  locationId: string;
  tenantSlug: string;
  /** Optional batch number filter */
  batchNo?: string;
  /** Qty at or below which the widget turns yellow */
  lowStockThreshold?: number;
}

interface StockBalance {
  itemId: string;
  locationId: string;
  batchNo?: string;
  availableQty: number;
  reservedQty: number;
  onOrderQty: number;
}

type StockStatus = 'green' | 'yellow' | 'red';

function getStatus(available: number, threshold: number): StockStatus {
  if (available <= 0) return 'red';
  if (available <= threshold) return 'yellow';
  return 'green';
}

const palette: Record<StockStatus, { bg: string; border: string; label: string; dot: string }> = {
  green: { bg: '#f0fdf4', border: '#bbf7d0', label: '#15803d', dot: '#22c55e' },
  yellow: { bg: '#fefce8', border: '#fde68a', label: '#a16207', dot: '#eab308' },
  red: { bg: '#fef2f2', border: '#fecaca', label: '#b91c1c', dot: '#ef4444' },
};

const S = {
  wrapper: {
    fontFamily: 'system-ui, -apple-system, sans-serif',
    fontSize: 13,
    lineHeight: 1.5,
  } as React.CSSProperties,
  card: (status: StockStatus): React.CSSProperties => ({
    display: 'inline-flex',
    flexDirection: 'column' as const,
    gap: 4,
    padding: '10px 14px',
    borderRadius: 8,
    border: `1px solid ${palette[status].border}`,
    background: palette[status].bg,
    minWidth: 160,
  }),
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  } as React.CSSProperties,
  dot: (status: StockStatus): React.CSSProperties => ({
    width: 8,
    height: 8,
    borderRadius: '50%',
    background: palette[status].dot,
    flexShrink: 0,
  }),
  label: (status: StockStatus): React.CSSProperties => ({
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: '0.04em',
    textTransform: 'uppercase' as const,
    color: palette[status].label,
  }),
  row: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: 16,
    color: '#374151',
  } as React.CSSProperties,
  key: { color: '#6b7280', fontSize: 12 } as React.CSSProperties,
  val: { fontWeight: 600, fontVariantNumeric: 'tabular-nums' } as React.CSSProperties,
  loading: {
    display: 'inline-block',
    padding: '8px 12px',
    borderRadius: 6,
    background: '#f3f4f6',
    color: '#9ca3af',
    fontSize: 12,
  } as React.CSSProperties,
};

export function StockBalanceWidget({
  itemId,
  locationId,
  tenantSlug,
  batchNo,
  lowStockThreshold = 10,
}: StockBalanceWidgetProps) {
  const [balance, setBalance] = useState<StockBalance | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchBalance = useCallback(async () => {
    if (!itemId || !locationId) return;

    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ itemId, locationId });
      if (batchNo) qs.set('batchNo', batchNo);
      const res = await fetch(`/api/runtime/${encodeURIComponent(tenantSlug)}/stock/balance?${qs}`);
      if (!res.ok) {
        const body = await res.json() as { error?: string };
        setError(body.error ?? `HTTP ${res.status}`);
        return;
      }
      setBalance(await res.json() as StockBalance);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [itemId, locationId, tenantSlug, batchNo]);

  useEffect(() => {
    void fetchBalance();
  }, [fetchBalance]);

  if (loading) return <span style={S.loading}>Loading stock…</span>;
  if (error) return <span style={{ ...S.loading, color: '#b91c1c' }}>Error: {error}</span>;
  if (!balance) return <span style={S.loading}>No data</span>;

  const status = getStatus(balance.availableQty, lowStockThreshold);
  const statusLabel =
    status === 'green' ? 'In Stock' : status === 'yellow' ? 'Low Stock' : 'Out of Stock';

  return (
    <div style={S.wrapper}>
      <div style={S.card(status)}>
        <div style={S.header}>
          <span style={S.dot(status)} />
          <span style={S.label(status)}>{statusLabel}</span>
        </div>
        <div style={S.row}>
          <span style={S.key}>Available</span>
          <span style={S.val}>{balance.availableQty}</span>
        </div>
        <div style={S.row}>
          <span style={S.key}>Reserved</span>
          <span style={S.val}>{balance.reservedQty}</span>
        </div>
        <div style={S.row}>
          <span style={S.key}>On Order</span>
          <span style={S.val}>{balance.onOrderQty}</span>
        </div>
      </div>
    </div>
  );
}
