'use client';

import * as React from 'react';
import { useParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Spinner } from '@/components/ui/spinner';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/components/ui/toast';
import type { BOMHeader, BOMLine } from '@/platform/manufacturing/types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function emptyLine(): Omit<BOMLine, 'id' | 'bomId'> {
  return {
    componentId: '',
    componentName: '',
    qtyPerUnit: 1,
    unit: 'EA',
    wastePercent: 0,
    isOptional: false,
    substituteIds: [],
  };
}

// ─── BOM Editor Modal ─────────────────────────────────────────────────────────

interface EditorModalProps {
  open: boolean;
  initial?: BOMHeader | null;
  onClose: () => void;
  onSave: (data: Partial<BOMHeader>) => Promise<void>;
}

function EditorModal({ open, initial, onClose, onSave }: EditorModalProps) {
  const [productId, setProductId] = React.useState('');
  const [productName, setProductName] = React.useState('');
  const [unit, setUnit] = React.useState('EA');
  const [version, setVersion] = React.useState('R0');
  const [notes, setNotes] = React.useState('');
  const [components, setComponents] = React.useState<Omit<BOMLine, 'id' | 'bomId'>[]>([emptyLine()]);
  const [byProducts, setByProducts] = React.useState<Omit<BOMLine, 'id' | 'bomId'>[]>([]);
  const [saving, setSaving] = React.useState(false);
  const [costMap, setCostMap] = React.useState<Record<number, string>>({});

  React.useEffect(() => {
    if (open && initial) {
      setProductId(initial.productId);
      setProductName(initial.productName);
      setUnit(initial.unit);
      setVersion(initial.version);
      setNotes(initial.notes ?? '');
      setComponents(
        initial.components.length > 0
          ? initial.components.map((c) => ({ ...c }))
          : [emptyLine()]
      );
      setByProducts((initial.byProducts ?? []).map((c) => ({ ...c })));
    } else if (open && !initial) {
      setProductId('');
      setProductName('');
      setUnit('EA');
      setVersion('R0');
      setNotes('');
      setComponents([emptyLine()]);
      setByProducts([]);
      setCostMap({});
    }
  }, [open, initial]);

  function updateLine(
    list: Omit<BOMLine, 'id' | 'bomId'>[],
    setList: React.Dispatch<React.SetStateAction<Omit<BOMLine, 'id' | 'bomId'>[]>>,
    idx: number,
    patch: Partial<Omit<BOMLine, 'id' | 'bomId'>>
  ) {
    setList(list.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  }

  function addLine(setList: React.Dispatch<React.SetStateAction<Omit<BOMLine, 'id' | 'bomId'>[]>>) {
    setList((prev) => [...prev, emptyLine()]);
  }

  function removeLine(
    list: Omit<BOMLine, 'id' | 'bomId'>[],
    setList: React.Dispatch<React.SetStateAction<Omit<BOMLine, 'id' | 'bomId'>[]>>,
    idx: number
  ) {
    setList(list.filter((_, i) => i !== idx));
  }

  // Cost calculator (client-side)
  const targetQty = 100;
  const materialCost = components.reduce((sum, c, i) => {
    const cost = parseFloat(costMap[i] ?? '0') || 0;
    const waste = 1 + (c.wastePercent || 0) / 100;
    return sum + c.qtyPerUnit * targetQty * waste * cost;
  }, 0);
  const byProductCredit = byProducts.reduce((sum, c, i) => {
    const cost = parseFloat(costMap[-(i + 1)] ?? '0') || 0;
    return sum + c.qtyPerUnit * targetQty * cost;
  }, 0);
  const netCost = materialCost - byProductCredit;
  const costPerUnit = targetQty > 0 ? netCost / targetQty : 0;

  async function handleSave() {
    if (!productId.trim() || !productName.trim()) return;
    setSaving(true);
    try {
      await onSave({ productId, productName, unit, version, notes, components: components as BOMLine[], byProducts: byProducts as BOMLine[] });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={initial ? 'Edit BOM' : 'New BOM'} size="xl">
      <div className="space-y-4">
        {/* Header fields */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-[var(--color-fg-muted)] mb-1">Product ID *</label>
            <Input value={productId} onChange={(e) => setProductId(e.target.value)} placeholder="SKU-001" />
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--color-fg-muted)] mb-1">Product Name *</label>
            <Input value={productName} onChange={(e) => setProductName(e.target.value)} placeholder="Finished Good" />
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--color-fg-muted)] mb-1">Unit</label>
            <Input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="EA" />
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--color-fg-muted)] mb-1">Version</label>
            <Input value={version} onChange={(e) => setVersion(e.target.value)} placeholder="R0" />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-[var(--color-fg-muted)] mb-1">Notes</label>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Optional notes" />
        </div>

        {/* Components */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold">Components</h3>
            <Button size="sm" variant="secondary" onClick={() => addLine(setComponents)}>+ Add</Button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[var(--color-border)] text-[var(--color-fg-muted)]">
                  <th className="text-left pb-1 pr-2">Component ID</th>
                  <th className="text-left pb-1 pr-2">Name</th>
                  <th className="text-left pb-1 pr-2 w-16">Qty/Unit</th>
                  <th className="text-left pb-1 pr-2 w-14">Unit</th>
                  <th className="text-left pb-1 pr-2 w-16">Waste %</th>
                  <th className="text-left pb-1 pr-2 w-14">Cost/unit</th>
                  <th className="text-left pb-1 w-16">Optional</th>
                  <th className="w-6"></th>
                </tr>
              </thead>
              <tbody>
                {components.map((c, i) => (
                  <tr key={i} className="border-b border-[var(--color-border-muted)]">
                    <td className="py-1 pr-2">
                      <Input value={c.componentId} onChange={(e) => updateLine(components, setComponents, i, { componentId: e.target.value })} placeholder="COMP-001" className="text-xs" />
                    </td>
                    <td className="py-1 pr-2">
                      <Input value={c.componentName} onChange={(e) => updateLine(components, setComponents, i, { componentName: e.target.value })} placeholder="Component" className="text-xs" />
                    </td>
                    <td className="py-1 pr-2">
                      <Input type="number" value={c.qtyPerUnit} onChange={(e) => updateLine(components, setComponents, i, { qtyPerUnit: parseFloat(e.target.value) || 0 })} className="text-xs" />
                    </td>
                    <td className="py-1 pr-2">
                      <Input value={c.unit} onChange={(e) => updateLine(components, setComponents, i, { unit: e.target.value })} placeholder="EA" className="text-xs" />
                    </td>
                    <td className="py-1 pr-2">
                      <Input type="number" value={c.wastePercent} onChange={(e) => updateLine(components, setComponents, i, { wastePercent: parseFloat(e.target.value) || 0 })} className="text-xs" />
                    </td>
                    <td className="py-1 pr-2">
                      <Input type="number" value={costMap[i] ?? ''} onChange={(e) => setCostMap((m) => ({ ...m, [i]: e.target.value }))} placeholder="0.00" className="text-xs" />
                    </td>
                    <td className="py-1 pr-2">
                      <Checkbox checked={c.isOptional} onChange={(checked) => updateLine(components, setComponents, i, { isOptional: checked })} />
                    </td>
                    <td className="py-1">
                      <button onClick={() => removeLine(components, setComponents, i)} className="text-[var(--color-danger)] hover:opacity-70 text-sm">×</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* By-products */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold">By-products <span className="text-[var(--color-fg-muted)] font-normal">(credits)</span></h3>
            <Button size="sm" variant="secondary" onClick={() => addLine(setByProducts)}>+ Add</Button>
          </div>
          {byProducts.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[var(--color-border)] text-[var(--color-fg-muted)]">
                    <th className="text-left pb-1 pr-2">Component ID</th>
                    <th className="text-left pb-1 pr-2">Name</th>
                    <th className="text-left pb-1 pr-2 w-16">Qty/Unit</th>
                    <th className="text-left pb-1 pr-2 w-14">Unit</th>
                    <th className="text-left pb-1 pr-2 w-14">Cost/unit</th>
                    <th className="w-6"></th>
                  </tr>
                </thead>
                <tbody>
                  {byProducts.map((c, i) => (
                    <tr key={i} className="border-b border-[var(--color-border-muted)]">
                      <td className="py-1 pr-2">
                        <Input value={c.componentId} onChange={(e) => updateLine(byProducts, setByProducts, i, { componentId: e.target.value })} placeholder="BY-001" className="text-xs" />
                      </td>
                      <td className="py-1 pr-2">
                        <Input value={c.componentName} onChange={(e) => updateLine(byProducts, setByProducts, i, { componentName: e.target.value })} placeholder="By-product" className="text-xs" />
                      </td>
                      <td className="py-1 pr-2">
                        <Input type="number" value={c.qtyPerUnit} onChange={(e) => updateLine(byProducts, setByProducts, i, { qtyPerUnit: parseFloat(e.target.value) || 0 })} className="text-xs" />
                      </td>
                      <td className="py-1 pr-2">
                        <Input value={c.unit} onChange={(e) => updateLine(byProducts, setByProducts, i, { unit: e.target.value })} placeholder="EA" className="text-xs" />
                      </td>
                      <td className="py-1 pr-2">
                        <Input type="number" value={costMap[-(i + 1)] ?? ''} onChange={(e) => setCostMap((m) => ({ ...m, [-(i + 1)]: e.target.value }))} placeholder="0.00" className="text-xs" />
                      </td>
                      <td className="py-1">
                        <button onClick={() => removeLine(byProducts, setByProducts, i)} className="text-[var(--color-danger)] hover:opacity-70 text-sm">×</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Cost summary */}
        <div className="bg-[var(--color-bg-muted)] rounded-[var(--radius-md)] p-3 text-sm">
          <div className="font-semibold mb-2 text-xs text-[var(--color-fg-muted)] uppercase tracking-wide">Cost Preview (qty 100)</div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
            <span className="text-[var(--color-fg-muted)]">Material cost</span>
            <span className="text-right font-mono">{materialCost.toFixed(2)}</span>
            <span className="text-[var(--color-fg-muted)]">By-product credit</span>
            <span className="text-right font-mono text-[var(--color-success)]">−{byProductCredit.toFixed(2)}</span>
            <span className="font-semibold">Net cost</span>
            <span className="text-right font-mono font-semibold">{netCost.toFixed(2)}</span>
            <span className="text-[var(--color-fg-muted)]">Cost / unit</span>
            <span className="text-right font-mono">{costPerUnit.toFixed(4)}</span>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            onClick={handleSave}
            disabled={saving || !productId.trim() || !productName.trim()}
          >
            {saving ? <Spinner size="sm" /> : initial ? 'Save Changes' : 'Create BOM'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function BOMs() {
  const params = useParams();
  const appId = params.appId as string;
  const { success, error: toastError } = useToast();

  const [boms, setBoms] = React.useState<BOMHeader[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [modalOpen, setModalOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<BOMHeader | null>(null);

  async function loadBoms() {
    setLoading(true);
    try {
      const res = await fetch(`/api/builder/apps/${appId}/boms`);
      if (!res.ok) throw new Error('Failed to load BOMs');
      setBoms(await res.json());
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Failed to load BOMs');
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => { loadBoms(); }, [appId]);

  async function handleSave(data: Partial<BOMHeader>) {
    const url = editing
      ? `/api/builder/apps/${appId}/boms/${editing.id}`
      : `/api/builder/apps/${appId}/boms`;
    const method = editing ? 'PUT' : 'POST';

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      toastError(err.error ?? 'Failed to save BOM');
      return;
    }

    success(editing ? 'BOM updated' : 'BOM created');
    setModalOpen(false);
    setEditing(null);
    await loadBoms();
  }

  async function handleDeactivate(bom: BOMHeader) {
    const res = await fetch(`/api/builder/apps/${appId}/boms/${bom.id}`, { method: 'DELETE' });
    if (!res.ok) {
      toastError('Failed to deactivate BOM');
      return;
    }
    success('BOM deactivated');
    await loadBoms();
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-[var(--color-fg-base)]">Bill of Materials</h1>
          <p className="text-sm text-[var(--color-fg-muted)] mt-0.5">Define recipes and production formulas</p>
        </div>
        <Button variant="primary" onClick={() => { setEditing(null); setModalOpen(true); }}>
          + New BOM
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Spinner /></div>
      ) : boms.length === 0 ? (
        <div className="text-center py-16 text-[var(--color-fg-muted)]">
          <p className="text-sm">No BOMs yet. Create your first bill of materials.</p>
        </div>
      ) : (
        <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[var(--color-bg-muted)] border-b border-[var(--color-border)]">
                <th className="text-left px-4 py-3 font-medium text-[var(--color-fg-muted)]">Product</th>
                <th className="text-left px-4 py-3 font-medium text-[var(--color-fg-muted)]">Version</th>
                <th className="text-left px-4 py-3 font-medium text-[var(--color-fg-muted)]">Components</th>
                <th className="text-left px-4 py-3 font-medium text-[var(--color-fg-muted)]">Status</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {boms.map((bom) => (
                <tr key={bom.id} className="border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-bg-muted)] transition-colors">
                  <td className="px-4 py-3">
                    <div className="font-medium">{bom.productName}</div>
                    <div className="text-xs text-[var(--color-fg-muted)]">{bom.productId}</div>
                  </td>
                  <td className="px-4 py-3 text-[var(--color-fg-muted)]">{bom.version}</td>
                  <td className="px-4 py-3 text-[var(--color-fg-muted)]">{bom.components.length}</td>
                  <td className="px-4 py-3">
                    <Badge variant={bom.isActive ? 'success' : 'neutral'}>
                      {bom.isActive ? 'Active' : 'Inactive'}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2 justify-end">
                      <Button size="sm" variant="secondary" onClick={() => { setEditing(bom); setModalOpen(true); }}>
                        Edit
                      </Button>
                      {bom.isActive && (
                        <Button size="sm" variant="danger" onClick={() => handleDeactivate(bom)}>
                          Deactivate
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <EditorModal
        open={modalOpen}
        initial={editing}
        onClose={() => { setModalOpen(false); setEditing(null); }}
        onSave={handleSave}
      />
    </div>
  );
}
