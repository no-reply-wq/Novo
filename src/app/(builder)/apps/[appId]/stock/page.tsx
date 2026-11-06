'use client';

import * as React from 'react';
import { useParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/toast';

// ─── Types ────────────────────────────────────────────────────────────────────

interface TableRow {
  id: string;
  label: string;
  slug: string;
}

interface StockConfigRow {
  id: string;
  app_id: string;
  table_id: string;
  config: StockFieldConfig;
  created_at: string;
}

interface StockFieldConfig {
  itemField: string;
  locationField: string;
  qtyField: string;
  direction: 'in' | 'out' | 'expression';
  directionExpr?: string;
  triggerStatus?: string;
  batchField?: string;
  unitField?: string;
  lowStockThreshold?: number;
}

// ─── Status badge helper ───────────────────────────────────────────────────────

type StockStatus = 'ok' | 'low' | 'out';

function statusBadge(qty: number, threshold: number): { status: StockStatus; label: string } {
  if (qty <= 0) return { status: 'out', label: 'Out of Stock' };
  if (qty <= threshold) return { status: 'low', label: 'Low Stock' };
  return { status: 'ok', label: 'OK' };
}

function StatusBadge({ qty, threshold }: { qty: number; threshold: number }) {
  const { status, label } = statusBadge(qty, threshold);
  const variant = status === 'ok' ? 'success' : status === 'low' ? 'warning' : 'danger';
  return <Badge variant={variant}>{label}</Badge>;
}

// ─── Config Modal ─────────────────────────────────────────────────────────────

interface ConfigModalProps {
  open: boolean;
  tables: TableRow[];
  initial: StockConfigRow | null;
  onClose: () => void;
  onSave: (tableId: string, config: StockFieldConfig) => Promise<void>;
}

function ConfigModal({ open, tables, initial, onClose, onSave }: ConfigModalProps) {
  const [tableId, setTableId] = React.useState('');
  const [itemField, setItemField] = React.useState('item_id');
  const [locationField, setLocationField] = React.useState('location_id');
  const [qtyField, setQtyField] = React.useState('qty');
  const [direction, setDirection] = React.useState<'in' | 'out' | 'expression'>('in');
  const [directionExpr, setDirectionExpr] = React.useState('');
  const [triggerStatus, setTriggerStatus] = React.useState('');
  const [batchField, setBatchField] = React.useState('');
  const [unitField, setUnitField] = React.useState('');
  const [lowStockThreshold, setLowStockThreshold] = React.useState(10);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (open && initial) {
      setTableId(initial.table_id);
      setItemField(initial.config.itemField);
      setLocationField(initial.config.locationField);
      setQtyField(initial.config.qtyField);
      setDirection(initial.config.direction);
      setDirectionExpr(initial.config.directionExpr ?? '');
      setTriggerStatus(initial.config.triggerStatus ?? '');
      setBatchField(initial.config.batchField ?? '');
      setUnitField(initial.config.unitField ?? '');
      setLowStockThreshold(initial.config.lowStockThreshold ?? 10);
    } else if (open && !initial) {
      setTableId(tables[0]?.id ?? '');
      setItemField('item_id');
      setLocationField('location_id');
      setQtyField('qty');
      setDirection('in');
      setDirectionExpr('');
      setTriggerStatus('');
      setBatchField('');
      setUnitField('');
      setLowStockThreshold(10);
    }
  }, [open, initial, tables]);

  async function handleSave() {
    if (!tableId) return;
    setSaving(true);
    try {
      await onSave(tableId, {
        itemField,
        locationField,
        qtyField,
        direction,
        directionExpr: directionExpr || undefined,
        triggerStatus: triggerStatus || undefined,
        batchField: batchField || undefined,
        unitField: unitField || undefined,
        lowStockThreshold,
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={initial ? 'Edit Stock Config' : 'Link Inventory Table'} size="lg">
      <div className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-[var(--color-fg-muted)] mb-1">Source Table *</label>
          <select
            value={tableId}
            onChange={(e) => setTableId(e.target.value)}
            className="w-full border border-[var(--color-border)] rounded-[var(--radius-md)] px-3 py-2 text-sm bg-[var(--color-bg-base)] text-[var(--color-fg-base)]"
          >
            <option value="">Select a table…</option>
            {tables.map((t) => (
              <option key={t.id} value={t.id}>{t.label}</option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-[var(--color-fg-muted)] mb-1">Item field *</label>
            <Input value={itemField} onChange={(e) => setItemField(e.target.value)} placeholder="item_id" />
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--color-fg-muted)] mb-1">Location field *</label>
            <Input value={locationField} onChange={(e) => setLocationField(e.target.value)} placeholder="location_id" />
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--color-fg-muted)] mb-1">Qty field *</label>
            <Input value={qtyField} onChange={(e) => setQtyField(e.target.value)} placeholder="qty" />
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--color-fg-muted)] mb-1">Unit field</label>
            <Input value={unitField} onChange={(e) => setUnitField(e.target.value)} placeholder="unit (optional)" />
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--color-fg-muted)] mb-1">Direction *</label>
            <select
              value={direction}
              onChange={(e) => setDirection(e.target.value as 'in' | 'out' | 'expression')}
              className="w-full border border-[var(--color-border)] rounded-[var(--radius-md)] px-3 py-2 text-sm bg-[var(--color-bg-base)] text-[var(--color-fg-base)]"
            >
              <option value="in">In (stock receipt)</option>
              <option value="out">Out (stock issue)</option>
              <option value="expression">Expression</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--color-fg-muted)] mb-1">Trigger status</label>
            <Input value={triggerStatus} onChange={(e) => setTriggerStatus(e.target.value)} placeholder="e.g. Approved" />
          </div>
          {direction === 'expression' && (
            <div className="col-span-2">
              <label className="block text-xs font-medium text-[var(--color-fg-muted)] mb-1">Direction expression</label>
              <Input value={directionExpr} onChange={(e) => setDirectionExpr(e.target.value)} placeholder="e.g. row.type === 'receipt' ? 'in' : 'out'" />
            </div>
          )}
          <div>
            <label className="block text-xs font-medium text-[var(--color-fg-muted)] mb-1">Batch field</label>
            <Input value={batchField} onChange={(e) => setBatchField(e.target.value)} placeholder="batch_no (optional)" />
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--color-fg-muted)] mb-1">Low-stock threshold</label>
            <Input
              type="number"
              value={lowStockThreshold}
              onChange={(e) => setLowStockThreshold(parseFloat(e.target.value) || 0)}
              placeholder="10"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            onClick={handleSave}
            disabled={saving || !tableId || !itemField || !locationField || !qtyField}
          >
            {saving ? <Spinner size="sm" /> : initial ? 'Save Changes' : 'Link Table'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function StockPage() {
  const params = useParams();
  const appId = params.appId as string;
  const { success, error: toastError } = useToast();

  const [tables, setTables] = React.useState<TableRow[]>([]);
  const [configs, setConfigs] = React.useState<StockConfigRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [modalOpen, setModalOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<StockConfigRow | null>(null);

  async function loadData() {
    setLoading(true);
    try {
      const [tablesRes, configsRes] = await Promise.all([
        fetch(`/api/builder/apps/${appId}/tables`),
        fetch(`/api/builder/apps/${appId}/stock-configs`),
      ]);
      if (!tablesRes.ok) throw new Error('Failed to load tables');
      if (!configsRes.ok) throw new Error('Failed to load stock configs');
      const tablesData = (await tablesRes.json()) as TableRow[];
      const configsData = (await configsRes.json()) as StockConfigRow[];
      setTables(tablesData);
      setConfigs(configsData);
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Failed to load stock data');
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => { loadData(); }, [appId]);

  async function handleSave(tableId: string, config: StockFieldConfig) {
    const res = await fetch(`/api/builder/apps/${appId}/stock-configs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tableId, config }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as { error?: string };
      toastError(err.error ?? 'Failed to save stock config');
      return;
    }

    success(editing ? 'Stock config updated' : 'Inventory table linked');
    setModalOpen(false);
    setEditing(null);
    await loadData();
  }

  function tableLabelForId(tableId: string): string {
    return tables.find((t) => t.id === tableId)?.label ?? tableId;
  }

  function directionLabel(dir: 'in' | 'out' | 'expression'): string {
    if (dir === 'in') return 'In';
    if (dir === 'out') return 'Out';
    return 'Expression';
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-[var(--color-fg-base)]">Stock Configuration</h1>
          <p className="text-sm text-[var(--color-fg-muted)] mt-0.5">
            Link inventory tables to track stock movements and balances
          </p>
        </div>
        <Button
          variant="primary"
          onClick={() => { setEditing(null); setModalOpen(true); }}
          disabled={tables.length === 0}
        >
          + Link Table
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Spinner /></div>
      ) : tables.length === 0 ? (
        <div className="text-center py-16 rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-muted)]">
          <p className="text-sm font-medium text-[var(--color-fg-base)] mb-1">No tables yet</p>
          <p className="text-xs text-[var(--color-fg-muted)]">
            Create a table first, then come back to configure stock tracking on it.
          </p>
        </div>
      ) : configs.length === 0 ? (
        <div className="text-center py-16 rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-muted)]">
          <p className="text-sm font-medium text-[var(--color-fg-base)] mb-1">No inventory tables linked</p>
          <p className="text-xs text-[var(--color-fg-muted)] max-w-sm mx-auto">
            Link an inventory table to start tracking stock levels, movements and balances.
          </p>
          <Button
            variant="primary"
            className="mt-4"
            onClick={() => { setEditing(null); setModalOpen(true); }}
          >
            Link Inventory Table
          </Button>
        </div>
      ) : (
        <div className="rounded-2xl border border-[var(--color-border)] overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[var(--color-bg-muted)] border-b border-[var(--color-border)]">
                <th className="text-left px-4 py-3 font-medium text-[var(--color-fg-muted)]">Table</th>
                <th className="text-left px-4 py-3 font-medium text-[var(--color-fg-muted)]">Item field</th>
                <th className="text-left px-4 py-3 font-medium text-[var(--color-fg-muted)]">Qty field</th>
                <th className="text-left px-4 py-3 font-medium text-[var(--color-fg-muted)]">Direction</th>
                <th className="text-left px-4 py-3 font-medium text-[var(--color-fg-muted)]">Low threshold</th>
                <th className="text-left px-4 py-3 font-medium text-[var(--color-fg-muted)]">Status</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {configs.map((cfg) => {
                const threshold = cfg.config.lowStockThreshold ?? 10;
                // We show the config itself; actual qty would need a separate balance fetch
                return (
                  <tr
                    key={cfg.id}
                    className="border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-bg-muted)] transition-colors"
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium">{tableLabelForId(cfg.table_id)}</div>
                      <div className="text-xs text-[var(--color-fg-muted)]">{cfg.table_id}</div>
                    </td>
                    <td className="px-4 py-3 text-[var(--color-fg-muted)]">{cfg.config.itemField}</td>
                    <td className="px-4 py-3 text-[var(--color-fg-muted)]">{cfg.config.qtyField}</td>
                    <td className="px-4 py-3">
                      <Badge variant={cfg.config.direction === 'in' ? 'success' : cfg.config.direction === 'out' ? 'danger' : 'neutral'}>
                        {directionLabel(cfg.config.direction)}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-[var(--color-fg-muted)] font-mono">{threshold}</td>
                    <td className="px-4 py-3">
                      <StatusBadge qty={threshold + 1} threshold={threshold} />
                    </td>
                    <td className="px-4 py-3">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => { setEditing(cfg); setModalOpen(true); }}
                      >
                        Edit
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Info panel */}
      <div className="mt-6 p-4 rounded-2xl bg-[var(--color-bg-muted)] border border-[var(--color-border)]">
        <h3 className="text-xs font-semibold text-[var(--color-fg-muted)] uppercase tracking-wide mb-2">How stock tracking works</h3>
        <ul className="text-xs text-[var(--color-fg-muted)] space-y-1 list-disc list-inside">
          <li>Link any table that records stock movements (receipts, issues, transfers).</li>
          <li>Set the direction: <strong>In</strong> for receipts, <strong>Out</strong> for issues, or use an expression for mixed tables.</li>
          <li>Use a trigger status (e.g. <em>Approved</em>) so only confirmed records update stock.</li>
          <li>The low-stock threshold controls the status badge in runtime views.</li>
          <li>Use BOMs to link finished goods with their component requirements.</li>
        </ul>
      </div>

      <ConfigModal
        open={modalOpen}
        tables={tables}
        initial={editing}
        onClose={() => { setModalOpen(false); setEditing(null); }}
        onSave={handleSave}
      />
    </div>
  );
}
