'use client';

/**
 * PageCustomizationSlots
 *
 * Renders whatever a page's UI Builder configuration actually calls
 * for — this is the piece that was missing before: usePageCustomization
 * fetches the data, but nothing ever turned it into buttons/tables on
 * screen. A page that wants UI Builder support just needs:
 *
 *   const custom = usePageCustomization(tenantSlug, 'leads');
 *   <PageToolbarButtons tenantSlug={tenantSlug} buttons={custom.toolbarButtons} />
 *   ...its own table, with a "row_actions" cell rendering...
 *   <PageRowButtons tenantSlug={tenantSlug} buttons={custom.rowButtons} rowId={row.id} />
 *   ...and filter its own columns array by custom.hiddenColumns before
 *   passing to DataTable.
 *
 * Table widgets (custom.tableWidgets) render as their own standalone
 * blocks via <PageTableWidgets>, dropped in wherever a page wants extra
 * data blocks to appear (typically below its main table).
 */

import { useState } from 'react';
import { Button, Modal } from '@/components/ui';
import { DynamicForm, type FormConfig } from '@/components/forms/DynamicForm';
import { DataTable } from '@/components/tables/DataTable';
import type { UIButtonConfig, UITableWidgetConfig } from '@/lib/hooks/usePageCustomization';

// ─────────────────────────────────────────────────────────────
// Shared: opening a button's linked form in a modal
// ─────────────────────────────────────────────────────────────

function useFormModal(tenantSlug: string) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormConfig | null>(null);
  const [prefill, setPrefill] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(false);

  async function openForm(button: UIButtonConfig, rowId?: string) {
    setLoading(true);
    setOpen(true);
    const [formRes, fieldsRes] = await Promise.all([
      fetch(`/api/tenant/form-builder/${button.form_id}?tenant=${tenantSlug}`).then((r) => r.json()),
      fetch(`/api/tenant/form-builder/${button.form_id}/fields?tenant=${tenantSlug}`).then((r) => r.json()),
    ]);
    setForm({ ...formRes.form, fields: fieldsRes.fields ?? [] });
    setPrefill(button.prefill_field && rowId ? { [button.prefill_field]: rowId } : {});
    setLoading(false);
  }

  async function submit(data: { formId: string; isTest: boolean; headerData: Record<string, unknown>; lineItems: unknown[] }) {
    await fetch(`/api/tenant/form-builder/submissions?tenant=${tenantSlug}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    setOpen(false);
  }

  const modal = open ? (
    <Modal open={open} onClose={() => setOpen(false)} title={form?.name ?? 'Loading…'}>
      {loading || !form ? (
        <p className="text-sm text-slate-400 p-6">Loading form…</p>
      ) : (
        <DynamicForm
          form={form}
          tenantSlug={tenantSlug}
          initialHeaderData={prefill}
          onSubmit={submit}
          onCancel={() => setOpen(false)}
        />
      )}
    </Modal>
  ) : null;

  return { openForm, modal };
}

// ─────────────────────────────────────────────────────────────
// Toolbar buttons — page-level, standalone
// ─────────────────────────────────────────────────────────────

export function PageToolbarButtons({ tenantSlug, buttons }: { tenantSlug: string; buttons: UIButtonConfig[] }) {
  const { openForm, modal } = useFormModal(tenantSlug);
  if (buttons.length === 0) return null;
  return (
    <>
      {buttons.map((b) => (
        <Button key={b.id} variant="secondary" onClick={() => openForm(b)}>
          {b.icon ? `${b.icon} ` : ''}{b.label}
        </Button>
      ))}
      {modal}
    </>
  );
}

// ─────────────────────────────────────────────────────────────
// Row-action buttons — formatted to merge straight into DataTable's
// existing `rowActions` prop, since every page already uses that for
// its own built-in Edit/Delete actions. Pre-fills the linked form
// with the row's own id.
// ─────────────────────────────────────────────────────────────

export function useUIBuilderRowActions(tenantSlug: string, buttons: UIButtonConfig[]) {
  const { openForm, modal } = useFormModal(tenantSlug);

  const rowActionItems = buttons.map((b) => ({
    label: b.icon ? `${b.icon} ${b.label}` : b.label,
    onClick: (row: { id: string }) => openForm(b, row.id),
  }));

  return { rowActionItems, modal };
}

// ─────────────────────────────────────────────────────────────
// Table widgets — standalone data blocks, own fetch of live data
// ─────────────────────────────────────────────────────────────

export function PageTableWidgets({ tenantSlug, widgets }: { tenantSlug: string; widgets: UITableWidgetConfig[] }) {
  if (widgets.length === 0) return null;
  return (
    <div className="space-y-6 mt-6">
      {widgets.map((w) => <TableWidget key={w.id} tenantSlug={tenantSlug} widget={w} />)}
    </div>
  );
}

function TableWidget({ tenantSlug, widget }: { tenantSlug: string; widget: UITableWidgetConfig }) {
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [collapsed, setCollapsed] = useState(widget.default_collapsed);

  useState(() => {
    const params = new URLSearchParams({
      tenant: tenantSlug,
      table: widget.source_table,
      columns: JSON.stringify(widget.columns.map((c) => c.key)),
      filters: JSON.stringify(widget.filters),
    });
    fetch(`/api/tenant/ui-builder/widget-data?${params}`)
      .then((r) => r.json())
      .then((d) => setRows(d.rows ?? []))
      .finally(() => setLoading(false));
  });

  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-slate-50">
        <h3 className="text-sm font-semibold text-slate-800">{widget.title}</h3>
        {widget.collapsible && (
          <button onClick={() => setCollapsed((c) => !c)} className="text-xs text-slate-500 hover:text-slate-700">
            {collapsed ? 'Expand' : 'Collapse'}
          </button>
        )}
      </div>
      {!collapsed && (
        <DataTable
          loading={loading}
          data={rows}
          total={rows.length}
          columns={widget.columns.map((c) => ({ key: c.key, label: c.label, type: c.type as 'text' }))}
          showSumRow={widget.show_sum_row}
          sumColumns={widget.sum_columns}
          emptyTitle="No data"
        />
      )}
    </div>
  );
}
