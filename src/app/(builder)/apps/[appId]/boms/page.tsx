'use client';

import * as React from 'react';
import { useParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { Spinner } from '@/components/ui/spinner';
import { useToast } from '@/components/ui/toast';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';

// ─── Types ────────────────────────────────────────────────────────────────────

interface BOMLineForm {
  componentId: string;
  componentName: string;
  qtyPerUnit: number;
  unit: string;
  wastePercent: number;
  isOptional: boolean;
  substituteIds: string[];
}

interface BOMByProductForm {
  componentId: string;
  componentName: string;
  qtyPerUnit: number;
  unit: string;
}

interface BOMView {
  id: string;
  appId: string;
  productId: string;
  productName: string;
  unit: string;
  version: string;
  isActive: boolean;
  notes: string | null;
  components: Array<BOMLineForm & { id: string; bomId: string }>;
  byProducts: Array<BOMByProductForm & { id: string; bomId: string }>;
  createdAt: string;
  updatedAt: string;
}

// ─── Empty component line ─────────────────────────────────────────────────────

function emptyLine(): BOMLineForm {
  return {
    componentId: '',
    componentName: '',
    qtyPerUnit: 1,
    unit: 'kg',
    wastePercent: 0,
    isOptional: false,
    substituteIds: [],
  };
}

function emptyByProduct(): BOMByProductForm {
  return {
    componentId: '',
    componentName: '',
    qtyPerUnit: 0,
    unit: 'kg',
  };
}

// ─── BOM Editor Modal ─────────────────────────────────────────────────────────

interface EditorModalProps {
  open: boolean;
  appId: string;
  editing: BOMView | null;
  onClose: () => void;
  onSaved: () => void;
}

function EditorModal({ open, appId, editing, onClose, onSaved }: EditorModalProps) {
  const { toast } = useToast();
  const [saving, setSaving] = React.useState(false);

  // Form state
  const [productId, setProductId] = React.useState('');
  const [productName, setProductName] = React.useState('');
  const [unit, setUnit] = React.useState('pcs');
  const [version, setVersion] = React.useState('R0');
  const [notes, setNotes] = React.useState('');
  const [components, setComponents] = React.useState<BOMLineForm[]>([emptyLine()]);
  const [byProducts, setByProducts] = React.useState<BOMByProductForm[]>([]);

  // Cost calculator state
  const [componentCosts, setComponentCosts] = React.useState<Record<string, number>>({});
  const [costResult, setCostResult] = React.useState<{
    materialCost: number;
    byProductCredit: number;
    netCost: number;
    costPerUnit: number;
  } | null>(null);
  const [costQty, setCostQty] = React.useState(1);

  // Reset form when modal opens
  React.useEffect(() => {
    if (!open) return;
    if (editing) {
      setProductId(editing.productId);
      setProductName(editing.productName);
      setUnit(editing.unit);
      setVersion(editing.version);
      setNotes(editing.notes ?? '');
      setComponents(
        editing.components.map((c) => ({
          componentId: c.componentId,
          componentName: c.componentName,
          qtyPerUnit: c.qtyPerUnit,
          unit: c.unit,
          wastePercent: c.wastePercent,
          isOptional: c.isOptional,
          substituteIds: c.substituteIds,
        }))
      );
      setByProducts(
        editing.byProducts.map((b) => ({
          componentId: b.componentId,
          componentName: b.componentName,
          qtyPerUnit: b.qtyPerUnit,
          unit: b.unit,
        }))
      );
    } else {
      setProductId('');
      setProductName('');
      setUnit('pcs');
      setVersion('R0');
      setNotes('');
      setComponents([emptyLine()]);
      setByProducts([]);
    }
    setComponentCosts({});
    setCostResult(null);
    setCostQty(1);
  }, [open, editing]);

  // ── Component line helpers
  const updateLine = (i: number, patch: Partial<BOMLineForm>) => {
    setComponents((prev) => prev.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));
  };

  const addLine = () => setComponents((prev) => [...prev, emptyLine()]);

  const removeLine = (i: number) =>
    setComponents((prev) => prev.filter((_, idx) => idx !== i));

  // ── By-product helpers
  const updateByProduct = (i: number, patch: Partial<BOMByProductForm>) => {
    setByProducts((prev) => prev.map((b, idx) => (idx === i ? { ...b, ...patch } : b)));
  };

  const addByProduct = () => setByProducts((prev) => [...prev, emptyByProduct()]);

  const removeByProduct = (i: number) =>
    setByProducts((prev) => prev.filter((_, idx) => idx !== i));

  // ── Cost calculator
  const calculateCost = () => {
    let materialCost = 0;
    for (const comp of components) {
      const cost = componentCosts[comp.componentId] ?? 0;
      const wasteFactor = 1 + comp.wastePercent / 100;
      materialCost += comp.qtyPerUnit * costQty * wasteFactor * cost;
    }

    let byProductCredit = 0;
    for (const bp of byProducts) {
      const cost = componentCosts[bp.componentId] ?? 0;
      byProductCredit += bp.qtyPerUnit * costQty * cost;
    }

    const netCost = materialCost - byProductCredit;
    const costPerUnit = costQty > 0 ? netCost / costQty : 0;
    setCostResult({ materialCost, byProductCredit, netCost, costPerUnit });
  };

  // ── Save
  const handleSave = async () => {
    if (!productId.trim() || !productName.trim()) {
      toast({ title: 'Product ID and Name are required', variant: 'destructive' });
      return;
    }

    const validComps = components.filter((c) => c.componentId.trim() && c.componentName.trim());
    if (validComps.length === 0) {
      toast({ title: 'At least one component is required', variant: 'destructive' });
      return;
    }

    setSaving(true);
    try {
      const payload = {
        productId: productId.trim(),
        productName: productName.trim(),
        unit,
        version,
        notes: notes.trim() || undefined,
        components: validComps,
        byProducts: byProducts.filter((b) => b.componentId.trim()),
      };

      const url = editing
        ? `/api/builder/apps/${appId}/boms/${editing.id}`
        : `/api/builder/apps/${appId}/boms`;

      const res = await fetch(url, {
        method: editing ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        toast({ title: data.error ?? 'Failed to save BOM', variant: 'destructive' });
        return;
      }

      toast({ title: `BOM ${editing ? 'updated' : 'created'} successfully` });
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={editing ? 'Edit BOM' : 'New BOM'} size="xl">
      <div className="space-y-6 pb-4">
        {/* Header fields */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700">Product ID</label>
            <Input
              value={productId}
              onChange={(e) => setProductId(e.target.value)}
              placeholder="e.g. FG-001"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700">Product Name</label>
            <Input
              value={productName}
              onChange={(e) => setProductName(e.target.value)}
              placeholder="e.g. Widget A"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700">Unit</label>
            <Input
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              placeholder="pcs / kg / litre"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700">Version</label>
            <Input
              value={version}
              onChange={(e) => setVersion(e.target.value)}
              placeholder="R0"
            />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-gray-700">Notes</label>
          <Input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Optional notes"
          />
        </div>

        {/* Component lines */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-800">Components</h3>
            <Button size="sm" variant="outline" onClick={addLine}>
              + Add Component
            </Button>
          </div>

          <div className="overflow-x-auto rounded border border-gray-200">
            <table className="w-full text-xs">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-2 py-2 text-left font-medium text-gray-600">Component ID</th>
                  <th className="px-2 py-2 text-left font-medium text-gray-600">Name</th>
                  <th className="px-2 py-2 text-left font-medium text-gray-600">Qty/Unit</th>
                  <th className="px-2 py-2 text-left font-medium text-gray-600">Unit</th>
                  <th className="px-2 py-2 text-left font-medium text-gray-600">Waste %</th>
                  <th className="px-2 py-2 text-center font-medium text-gray-600">Optional</th>
                  <th className="px-2 py-2" />
                </tr>
              </thead>
              <tbody>
                {components.map((comp, i) => (
                  <tr key={i} className="border-t border-gray-100">
                    <td className="px-2 py-1">
                      <Input
                        className="h-7 text-xs"
                        value={comp.componentId}
                        onChange={(e) => updateLine(i, { componentId: e.target.value })}
                        placeholder="RM-001"
                      />
                    </td>
                    <td className="px-2 py-1">
                      <Input
                        className="h-7 text-xs"
                        value={comp.componentName}
                        onChange={(e) => updateLine(i, { componentName: e.target.value })}
                        placeholder="Raw Material A"
                      />
                    </td>
                    <td className="px-2 py-1">
                      <Input
                        className="h-7 w-20 text-xs"
                        type="number"
                        min={0}
                        step="any"
                        value={comp.qtyPerUnit}
                        onChange={(e) => updateLine(i, { qtyPerUnit: parseFloat(e.target.value) || 0 })}
                      />
                    </td>
                    <td className="px-2 py-1">
                      <Input
                        className="h-7 w-16 text-xs"
                        value={comp.unit}
                        onChange={(e) => updateLine(i, { unit: e.target.value })}
                      />
                    </td>
                    <td className="px-2 py-1">
                      <Input
                        className="h-7 w-16 text-xs"
                        type="number"
                        min={0}
                        max={100}
                        step="any"
                        value={comp.wastePercent}
                        onChange={(e) => updateLine(i, { wastePercent: parseFloat(e.target.value) || 0 })}
                      />
                    </td>
                    <td className="px-2 py-1 text-center">
                      <Checkbox
                        checked={comp.isOptional}
                        onCheckedChange={(v) => updateLine(i, { isOptional: Boolean(v) })}
                      />
                    </td>
                    <td className="px-2 py-1">
                      <button
                        onClick={() => removeLine(i)}
                        className="text-red-400 hover:text-red-600"
                        aria-label="Remove component"
                      >
                        ×
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* By-products */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-800">By-products</h3>
            <Button size="sm" variant="outline" onClick={addByProduct}>
              + Add By-product
            </Button>
          </div>

          {byProducts.length > 0 && (
            <div className="overflow-x-auto rounded border border-gray-200">
              <table className="w-full text-xs">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-2 py-2 text-left font-medium text-gray-600">Component ID</th>
                    <th className="px-2 py-2 text-left font-medium text-gray-600">Name</th>
                    <th className="px-2 py-2 text-left font-medium text-gray-600">Qty/Unit</th>
                    <th className="px-2 py-2 text-left font-medium text-gray-600">Unit</th>
                    <th className="px-2 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {byProducts.map((bp, i) => (
                    <tr key={i} className="border-t border-gray-100">
                      <td className="px-2 py-1">
                        <Input
                          className="h-7 text-xs"
                          value={bp.componentId}
                          onChange={(e) => updateByProduct(i, { componentId: e.target.value })}
                          placeholder="BP-001"
                        />
                      </td>
                      <td className="px-2 py-1">
                        <Input
                          className="h-7 text-xs"
                          value={bp.componentName}
                          onChange={(e) => updateByProduct(i, { componentName: e.target.value })}
                          placeholder="By-product Name"
                        />
                      </td>
                      <td className="px-2 py-1">
                        <Input
                          className="h-7 w-20 text-xs"
                          type="number"
                          min={0}
                          step="any"
                          value={bp.qtyPerUnit}
                          onChange={(e) => updateByProduct(i, { qtyPerUnit: parseFloat(e.target.value) || 0 })}
                        />
                      </td>
                      <td className="px-2 py-1">
                        <Input
                          className="h-7 w-16 text-xs"
                          value={bp.unit}
                          onChange={(e) => updateByProduct(i, { unit: e.target.value })}
                        />
                      </td>
                      <td className="px-2 py-1">
                        <button
                          onClick={() => removeByProduct(i)}
                          className="text-red-400 hover:text-red-600"
                          aria-label="Remove by-product"
                        >
                          ×
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Cost calculator */}
        <div className="rounded border border-indigo-100 bg-indigo-50 p-3">
          <h3 className="mb-2 text-sm font-semibold text-indigo-800">Cost Calculator</h3>
          <div className="mb-2 flex items-center gap-2">
            <label className="text-xs text-gray-600">Production qty:</label>
            <Input
              className="h-7 w-24 text-xs"
              type="number"
              min={1}
              value={costQty}
              onChange={(e) => setCostQty(parseInt(e.target.value, 10) || 1)}
            />
          </div>

          <div className="mb-3 space-y-1">
            {components
              .filter((c) => c.componentId.trim())
              .map((c) => (
                <div key={c.componentId} className="flex items-center gap-2">
                  <span className="w-32 truncate text-xs text-gray-600">{c.componentName || c.componentId}:</span>
                  <Input
                    className="h-6 w-24 text-xs"
                    type="number"
                    min={0}
                    step="any"
                    placeholder="cost/unit"
                    value={componentCosts[c.componentId] ?? ''}
                    onChange={(e) =>
                      setComponentCosts((prev) => ({
                        ...prev,
                        [c.componentId]: parseFloat(e.target.value) || 0,
                      }))
                    }
                  />
                </div>
              ))}
            {byProducts
              .filter((b) => b.componentId.trim())
              .map((b) => (
                <div key={b.componentId} className="flex items-center gap-2">
                  <span className="w-32 truncate text-xs text-indigo-600">
                    {b.componentName || b.componentId} (by-product):
                  </span>
                  <Input
                    className="h-6 w-24 text-xs"
                    type="number"
                    min={0}
                    step="any"
                    placeholder="credit/unit"
                    value={componentCosts[b.componentId] ?? ''}
                    onChange={(e) =>
                      setComponentCosts((prev) => ({
                        ...prev,
                        [b.componentId]: parseFloat(e.target.value) || 0,
                      }))
                    }
                  />
                </div>
              ))}
          </div>

          <Button size="sm" variant="outline" onClick={calculateCost}>
            Calculate
          </Button>

          {costResult && (
            <div className="mt-2 grid grid-cols-2 gap-1 rounded bg-white p-2 text-xs">
              <span className="text-gray-600">Material Cost:</span>
              <span className="font-mono font-medium">{costResult.materialCost.toFixed(2)}</span>
              <span className="text-gray-600">By-product Credit:</span>
              <span className="font-mono font-medium text-green-600">
                -{costResult.byProductCredit.toFixed(2)}
              </span>
              <span className="text-gray-600">Net Cost:</span>
              <span className="font-mono font-semibold">{costResult.netCost.toFixed(2)}</span>
              <span className="text-gray-600">Cost per Unit:</span>
              <span className="font-mono font-semibold text-indigo-600">
                {costResult.costPerUnit.toFixed(2)}
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="flex justify-end gap-2 border-t pt-3">
        <Button variant="outline" onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? <Spinner size="sm" /> : editing ? 'Save Changes' : 'Create BOM'}
        </Button>
      </div>
    </Modal>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function BOMsPage() {
  const { appId } = useParams<{ appId: string }>();
  const { toast } = useToast();

  const [boms, setBoms] = React.useState<BOMView[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [modalOpen, setModalOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<BOMView | null>(null);
  const [deleting, setDeleting] = React.useState<string | null>(null);

  const loadBOMs = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/builder/apps/${appId}/boms`);
      if (!res.ok) throw new Error('Failed to load BOMs');
      const data = (await res.json()) as { boms: BOMView[] };
      setBoms(data.boms);
    } catch {
      toast({ title: 'Failed to load BOMs', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [appId, toast]);

  React.useEffect(() => {
    void loadBOMs();
  }, [loadBOMs]);

  const openCreate = () => {
    setEditing(null);
    setModalOpen(true);
  };

  const openEdit = (bom: BOMView) => {
    setEditing(bom);
    setModalOpen(true);
  };

  const handleDeactivate = async (bomId: string) => {
    if (!confirm('Deactivate this BOM?')) return;
    setDeleting(bomId);
    try {
      const res = await fetch(`/api/builder/apps/${appId}/boms/${bomId}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error();
      toast({ title: 'BOM deactivated' });
      void loadBOMs();
    } catch {
      toast({ title: 'Failed to deactivate BOM', variant: 'destructive' });
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Bill of Materials</h1>
          <p className="mt-0.5 text-sm text-gray-500">
            Define recipes for manufactured products
          </p>
        </div>
        <Button onClick={openCreate}>+ New BOM</Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Spinner size="lg" />
        </div>
      ) : boms.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 py-16 text-center">
          <p className="text-sm text-gray-500">No BOMs yet. Create your first recipe.</p>
          <Button className="mt-3" onClick={openCreate}>
            + New BOM
          </Button>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-gray-200">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Product</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Version</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Unit</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Components</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {boms.map((bom) => (
                <tr key={bom.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900">{bom.productName}</div>
                    <div className="text-xs text-gray-500">{bom.productId}</div>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-700">{bom.version}</td>
                  <td className="px-4 py-3 text-gray-700">{bom.unit}</td>
                  <td className="px-4 py-3 text-gray-700">{bom.components.length}</td>
                  <td className="px-4 py-3">
                    <Badge variant={bom.isActive ? 'success' : 'secondary'}>
                      {bom.isActive ? 'Active' : 'Inactive'}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => openEdit(bom)}
                        className="text-xs text-indigo-600 hover:underline"
                      >
                        Edit
                      </button>
                      {bom.isActive && (
                        <button
                          onClick={() => void handleDeactivate(bom.id)}
                          disabled={deleting === bom.id}
                          className="text-xs text-red-500 hover:underline disabled:opacity-50"
                        >
                          {deleting === bom.id ? '…' : 'Deactivate'}
                        </button>
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
        appId={appId}
        editing={editing}
        onClose={() => setModalOpen(false)}
        onSaved={() => {
          setModalOpen(false);
          void loadBOMs();
        }}
      />
    </div>
  );
}
