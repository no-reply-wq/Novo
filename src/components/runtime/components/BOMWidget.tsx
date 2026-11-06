'use client';

import * as React from 'react';
import { Spinner } from '@/components/ui/spinner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { MaterialAvailability } from '@/platform/manufacturing/types';

interface BOMWidgetProps {
  tenantSlug: string;
  appId: string;
  bomId: string;
  targetQty: number;
  locationId?: string;
}

export function BOMWidget({ tenantSlug, appId, bomId, targetQty, locationId }: BOMWidgetProps) {
  const [availability, setAvailability] = React.useState<MaterialAvailability[] | null>(null);
  const [canFulfil, setCanFulfil] = React.useState(false);
  const [availLoading, setAvailLoading] = React.useState(false);
  const [woLoading, setWoLoading] = React.useState(false);
  const [woId, setWoId] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const checkAvailability = React.useCallback(async () => {
    if (!bomId || !appId || targetQty <= 0) return;
    setAvailLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ appId, targetQty: String(targetQty) });
      if (locationId) qs.set('locationId', locationId);
      const res = await fetch(`/api/runtime/${tenantSlug}/boms/${bomId}/availability?${qs}`);
      if (!res.ok) throw new Error('Failed to check availability');
      const data: { canFulfil: boolean; availability: MaterialAvailability[] } = await res.json();
      setAvailability(data.availability);
      setCanFulfil(data.canFulfil);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setAvailLoading(false);
    }
  }, [tenantSlug, appId, bomId, targetQty, locationId]);

  React.useEffect(() => {
    void checkAvailability();
  }, [checkAvailability]);

  async function createWorkOrder() {
    setWoLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/runtime/${tenantSlug}/boms/${bomId}/work-order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appId, targetQty }),
      });
      if (!res.ok) throw new Error('Failed to create work order');
      const data: { id: string } = await res.json();
      setWoId(data.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setWoLoading(false);
    }
  }

  return (
    <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-surface)] p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-[var(--color-fg-base)]">
          Material Availability — qty {targetQty}
        </h2>
        <Button size="sm" variant="secondary" onClick={checkAvailability} disabled={availLoading}>
          {availLoading ? <Spinner size="sm" /> : 'Refresh'}
        </Button>
      </div>

      {error && (
        <div className="text-xs text-[var(--color-danger)] mb-3">{error}</div>
      )}

      {availLoading && !availability && (
        <div className="flex justify-center py-8"><Spinner /></div>
      )}

      {availability && (
        <>
          <div className="overflow-x-auto mb-3">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[var(--color-border)] text-[var(--color-fg-muted)]">
                  <th className="text-left pb-2 pr-3">Component</th>
                  <th className="text-right pb-2 pr-3">Required</th>
                  <th className="text-right pb-2 pr-3">Available</th>
                  <th className="text-right pb-2 pr-3">Shortage</th>
                  <th className="text-left pb-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {availability.map((a) => (
                  <tr key={a.componentId} className="border-b border-[var(--color-border-muted)] last:border-0">
                    <td className="py-1.5 pr-3">
                      <div className="font-medium">{a.componentName}</div>
                      <div className="text-[var(--color-fg-muted)]">{a.componentId}</div>
                    </td>
                    <td className="py-1.5 pr-3 text-right font-mono">{a.requiredQty.toFixed(2)}</td>
                    <td className="py-1.5 pr-3 text-right font-mono">{a.availableQty.toFixed(2)}</td>
                    <td className="py-1.5 pr-3 text-right font-mono">
                      {a.shortage > 0 ? (
                        <span className="text-[var(--color-danger)]">{a.shortage.toFixed(2)}</span>
                      ) : (
                        <span className="text-[var(--color-success)]">—</span>
                      )}
                    </td>
                    <td className="py-1.5">
                      {a.shortage > 0 ? (
                        <Badge variant={a.hasSubstitute ? 'warning' : 'danger'}>
                          {a.hasSubstitute ? 'Substitute' : 'Shortage'}
                        </Badge>
                      ) : (
                        <Badge variant="success">OK</Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between">
            <Badge variant={canFulfil ? 'success' : 'danger'}>
              {canFulfil ? 'Can fulfil' : 'Cannot fulfil'}
            </Badge>

            {woId ? (
              <div className="text-xs text-[var(--color-success)]">
                Work order created: <span className="font-mono">{woId.slice(0, 8)}…</span>
              </div>
            ) : (
              <Button
                size="sm"
                variant="primary"
                onClick={createWorkOrder}
                disabled={woLoading || !availability}
              >
                {woLoading ? <Spinner size="sm" /> : 'Create Work Order'}
              </Button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
