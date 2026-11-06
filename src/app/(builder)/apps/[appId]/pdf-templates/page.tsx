'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { useParams } from 'next/navigation';
import type { PDFTemplate, PDFBlock, PDFBlockType, LineItemColumn } from '@/platform/pdf/types';

// ─── Styles ───────────────────────────────────────────────────────────────────

const S = {
  page: { padding: 24, maxWidth: 1100, margin: '0 auto' } as React.CSSProperties,
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 } as React.CSSProperties,
  title: { fontSize: 20, fontWeight: 700, color: '#111' } as React.CSSProperties,
  btn: {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    padding: '8px 16px', background: '#2563eb', color: '#fff',
    border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 500, cursor: 'pointer',
  } as React.CSSProperties,
  btnDanger: {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    padding: '6px 12px', background: 'transparent', color: '#dc2626',
    border: '1px solid #fca5a5', borderRadius: 6, fontSize: 12, cursor: 'pointer',
  } as React.CSSProperties,
  btnSecondary: {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    padding: '7px 14px', background: '#f3f4f6', color: '#374151',
    border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, cursor: 'pointer',
  } as React.CSSProperties,
  card: {
    border: '1px solid #e5e7eb', borderRadius: 8, padding: 16, marginBottom: 12,
    background: '#fff', display: 'flex', alignItems: 'flex-start', gap: 16,
  } as React.CSSProperties,
  cardBody: { flex: 1 } as React.CSSProperties,
  cardTitle: { fontWeight: 600, fontSize: 15, marginBottom: 4 } as React.CSSProperties,
  cardMeta: { fontSize: 12, color: '#6b7280' } as React.CSSProperties,
  actions: { display: 'flex', gap: 8 } as React.CSSProperties,
  section: { marginBottom: 20 } as React.CSSProperties,
  label: { display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4 } as React.CSSProperties,
  input: {
    width: '100%', padding: '7px 10px', border: '1px solid #d1d5db',
    borderRadius: 6, fontSize: 13, outline: 'none',
  } as React.CSSProperties,
  select: {
    width: '100%', padding: '7px 10px', border: '1px solid #d1d5db',
    borderRadius: 6, fontSize: 13, background: '#fff',
  } as React.CSSProperties,
  row: { display: 'flex', gap: 12 } as React.CSSProperties,
  col: { flex: 1 } as React.CSSProperties,
  modalOverlay: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999,
  } as React.CSSProperties,
  modal: {
    background: '#fff', borderRadius: 10, padding: 24,
    width: 640, maxWidth: '95vw', maxHeight: '90vh', overflowY: 'auto',
  } as React.CSSProperties,
  modalTitle: { fontSize: 17, fontWeight: 700, marginBottom: 20 } as React.CSSProperties,
  blockItem: {
    border: '1px solid #e5e7eb', borderRadius: 6, padding: 10, marginBottom: 8,
    display: 'flex', alignItems: 'center', gap: 10, background: '#fafafa',
  } as React.CSSProperties,
  blockType: { fontSize: 11, color: '#6b7280', background: '#e5e7eb', borderRadius: 4, padding: '2px 6px' } as React.CSSProperties,
  emptyState: { textAlign: 'center', color: '#9ca3af', padding: 40 } as React.CSSProperties,
  errorMsg: { color: '#dc2626', fontSize: 12, marginTop: 4 } as React.CSSProperties,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeBlock(type: PDFBlockType): PDFBlock {
  const id = crypto.randomUUID();
  const defaults: Record<PDFBlockType, Record<string, unknown>> = {
    text: { content: 'Your text here' },
    heading: { content: 'Heading', level: 2 },
    image: { src: '', alt: '', width: '100%' },
    divider: {},
    spacer: { height: '16px' },
    two_column: { left: [], right: [] },
    table: { columns: [] },
    line_items: {
      columns: [
        { label: '#', field: 'sno', width: '40px', align: 'center', format: 'text' },
        { label: 'Description', field: 'description', format: 'text' },
        { label: 'Qty', field: 'qty', align: 'right', format: 'number' },
        { label: 'Rate', field: 'rate', align: 'right', format: 'currency' },
        { label: 'Amount', field: 'amount', align: 'right', format: 'currency' },
      ] as LineItemColumn[],
      showTotals: true,
    },
    totals: {
      rows: [
        { label: 'Subtotal', expression: 'SUM(lines.amount)' },
        { label: 'GST (18%)', expression: 'SUM(lines.gst_amount)' },
        { label: 'Total', expression: 'record.total' },
      ],
    },
    gstin_block: { showGSTSplit: true },
    amount_in_words: { field: 'total', expression: 'record.total' },
    qr_code: { value: '{{record.id}}', size: 80 },
    barcode: { value: '{{record.invoice_number}}' },
  };
  return { id, type, props: defaults[type] ?? {} };
}

// ─── Block List Editor ────────────────────────────────────────────────────────

function BlockListEditor({
  blocks,
  onChange,
}: {
  blocks: PDFBlock[];
  onChange: (blocks: PDFBlock[]) => void;
}) {
  const [adding, setAdding] = useState(false);

  const blockTypes: PDFBlockType[] = [
    'text', 'heading', 'image', 'divider', 'spacer',
    'two_column', 'line_items', 'totals', 'gstin_block',
    'amount_in_words', 'qr_code', 'barcode',
  ];

  const addBlock = (type: PDFBlockType) => {
    onChange([...blocks, makeBlock(type)]);
    setAdding(false);
  };

  const removeBlock = (id: string) => {
    onChange(blocks.filter((b) => b.id !== id));
  };

  const moveBlock = (id: string, dir: -1 | 1) => {
    const idx = blocks.findIndex((b) => b.id === id);
    if (idx < 0) return;
    const next = [...blocks];
    const swap = next[idx + dir];
    if (!swap) return;
    next[idx + dir] = next[idx] as PDFBlock;
    next[idx] = swap;
    onChange(next);
  };

  return (
    <div>
      {blocks.length === 0 && (
        <div style={S.emptyState}>No blocks yet. Add one below.</div>
      )}
      {blocks.map((block, idx) => (
        <div key={block.id} style={S.blockItem}>
          <div style={{ flex: 1 }}>
            <span style={{ fontWeight: 600, fontSize: 13 }}>{block.type}</span>
            <span style={{ ...S.blockType, marginLeft: 8 }}>{block.id.slice(0, 8)}</span>
          </div>
          <div style={S.actions}>
            <button
              style={S.btnSecondary}
              onClick={() => moveBlock(block.id, -1)}
              disabled={idx === 0}
              title="Move up"
            >↑</button>
            <button
              style={S.btnSecondary}
              onClick={() => moveBlock(block.id, 1)}
              disabled={idx === blocks.length - 1}
              title="Move down"
            >↓</button>
            <button
              style={S.btnDanger}
              onClick={() => removeBlock(block.id)}
              title="Remove block"
            >✕</button>
          </div>
        </div>
      ))}

      {adding ? (
        <div style={{ border: '1px dashed #93c5fd', borderRadius: 6, padding: 12 }}>
          <div style={{ marginBottom: 8, fontSize: 12, fontWeight: 600, color: '#374151' }}>
            Select block type:
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {blockTypes.map((type) => (
              <button key={type} style={S.btnSecondary} onClick={() => addBlock(type)}>
                {type}
              </button>
            ))}
          </div>
          <button style={{ ...S.btnDanger, marginTop: 8 }} onClick={() => setAdding(false)}>
            Cancel
          </button>
        </div>
      ) : (
        <button style={{ ...S.btnSecondary, width: '100%', justifyContent: 'center', marginTop: 4 }} onClick={() => setAdding(true)}>
          + Add Block
        </button>
      )}
    </div>
  );
}

// ─── Template Editor Modal ────────────────────────────────────────────────────

function TemplateEditorModal({
  initial,
  onSave,
  onClose,
}: {
  initial?: PDFTemplate;
  onSave: (t: Partial<PDFTemplate>) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [pageSize, setPageSize] = useState<PDFTemplate['pageSize']>(initial?.pageSize ?? 'A4');
  const [orientation, setOrientation] = useState<PDFTemplate['orientation']>(
    initial?.orientation ?? 'portrait'
  );
  const [margins, setMargins] = useState(
    initial?.margins ?? { top: 20, right: 15, bottom: 20, left: 15 }
  );
  const [body, setBody] = useState<PDFBlock[]>(initial?.body ?? []);
  const [header, setHeader] = useState<PDFBlock[]>(initial?.header ?? []);
  const [footer, setFooter] = useState<PDFBlock[]>(initial?.footer ?? []);
  const [tab, setTab] = useState<'general' | 'body' | 'header' | 'footer'>('general');

  const save = () => {
    if (!name.trim()) return;
    onSave({ name, pageSize, orientation, margins, body, header, footer, styles: {} });
  };

  return (
    <div style={S.modalOverlay} onClick={onClose}>
      <div style={S.modal} onClick={(e) => e.stopPropagation()}>
        <div style={S.modalTitle}>{initial ? 'Edit Template' : 'New Template'}</div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 20, borderBottom: '1px solid #e5e7eb', paddingBottom: 8 }}>
          {(['general', 'body', 'header', 'footer'] as const).map((t) => (
            <button
              key={t}
              style={{
                ...S.btnSecondary,
                background: tab === t ? '#dbeafe' : undefined,
                color: tab === t ? '#1d4ed8' : undefined,
                borderColor: tab === t ? '#93c5fd' : undefined,
              }}
              onClick={() => setTab(t)}
            >
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>

        {tab === 'general' && (
          <div>
            <div style={S.section}>
              <label style={S.label}>Template Name *</label>
              <input
                style={S.input}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Sales Quotation"
              />
            </div>
            <div style={{ ...S.row, ...S.section }}>
              <div style={S.col}>
                <label style={S.label}>Page Size</label>
                <select style={S.select} value={pageSize} onChange={(e) => setPageSize(e.target.value as PDFTemplate['pageSize'])}>
                  <option value="A4">A4</option>
                  <option value="A5">A5</option>
                  <option value="Letter">Letter</option>
                </select>
              </div>
              <div style={S.col}>
                <label style={S.label}>Orientation</label>
                <select style={S.select} value={orientation} onChange={(e) => setOrientation(e.target.value as PDFTemplate['orientation'])}>
                  <option value="portrait">Portrait</option>
                  <option value="landscape">Landscape</option>
                </select>
              </div>
            </div>
            <div style={S.section}>
              <label style={S.label}>Margins (mm)</label>
              <div style={S.row}>
                {(['top', 'right', 'bottom', 'left'] as const).map((side) => (
                  <div key={side} style={S.col}>
                    <label style={{ ...S.label, fontSize: 11 }}>{side}</label>
                    <input
                      type="number"
                      style={S.input}
                      value={margins[side]}
                      onChange={(e) => setMargins({ ...margins, [side]: Number(e.target.value) })}
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {tab === 'body' && (
          <div>
            <div style={{ marginBottom: 12, fontSize: 12, color: '#6b7280' }}>
              Body blocks render as the main content area of the PDF.
            </div>
            <BlockListEditor blocks={body} onChange={setBody} />
          </div>
        )}

        {tab === 'header' && (
          <div>
            <div style={{ marginBottom: 12, fontSize: 12, color: '#6b7280' }}>
              Header blocks repeat on every page at the top.
            </div>
            <BlockListEditor blocks={header} onChange={setHeader} />
          </div>
        )}

        {tab === 'footer' && (
          <div>
            <div style={{ marginBottom: 12, fontSize: 12, color: '#6b7280' }}>
              Footer blocks repeat on every page at the bottom. Page numbers are added automatically.
            </div>
            <BlockListEditor blocks={footer} onChange={setFooter} />
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 24, borderTop: '1px solid #e5e7eb', paddingTop: 16 }}>
          <button style={S.btnSecondary} onClick={onClose}>Cancel</button>
          <button style={S.btn} onClick={save} disabled={!name.trim()}>
            {initial ? 'Save Changes' : 'Create Template'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function PDFTemplatesPage() {
  const params = useParams<{ appId: string }>();
  const appId = params.appId;

  const [templates, setTemplates] = useState<PDFTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<PDFTemplate | null>(null);
  const [generating, setGenerating] = useState<string | null>(null);

  const loadTemplates = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/builder/apps/${appId}/pdf-templates`);
      const data = (await res.json()) as { templates: PDFTemplate[] };
      setTemplates(data.templates ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [appId]);

  useEffect(() => { void loadTemplates(); }, [loadTemplates]);

  const handleCreate = async (partial: Partial<PDFTemplate>) => {
    try {
      const res = await fetch(`/api/builder/apps/${appId}/pdf-templates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(partial),
      });
      const data = (await res.json()) as { template: PDFTemplate };
      setTemplates((prev) => [...prev, data.template]);
      setShowCreate(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create');
    }
  };

  const handleUpdate = async (id: string, partial: Partial<PDFTemplate>) => {
    try {
      const res = await fetch(`/api/builder/apps/${appId}/pdf-templates/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(partial),
      });
      const data = (await res.json()) as { template: PDFTemplate };
      setTemplates((prev) => prev.map((t) => (t.id === id ? data.template : t)));
      setEditing(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this template? This cannot be undone.')) return;
    try {
      await fetch(`/api/builder/apps/${appId}/pdf-templates/${id}`, { method: 'DELETE' });
      setTemplates((prev) => prev.filter((t) => t.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete');
    }
  };

  const handlePreview = (template: PDFTemplate) => {
    // Open HTML preview in new tab (requires tenantSlug; use 'preview' as placeholder)
    window.open(`/api/runtime/preview/pdf/preview/${template.id}`, '_blank');
  };

  const handleDownloadSample = async (template: PDFTemplate) => {
    setGenerating(template.id);
    try {
      const res = await fetch(`/api/runtime/preview/pdf/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          templateId: template.id,
          recordId: 'sample-001',
          tableId: 'sample',
          record: {
            id: 'SAMPLE-001',
            invoice_number: 'INV-2024-001',
            buyer_name: 'Sample Customer',
            buyer_gstin: '29AABCT1332L1ZT',
            total: 11800,
          },
          lines: [
            { description: 'Product A', qty: 2, rate: 5000, taxable_amount: 10000, gst_amount: 1800, amount: 11800 },
          ],
        }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? 'Generation failed');
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${template.name}-sample.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Download failed');
    } finally {
      setGenerating(null);
    }
  };

  return (
    <div style={S.page}>
      <div style={S.header}>
        <h1 style={S.title}>PDF Templates</h1>
        <button style={S.btn} onClick={() => setShowCreate(true)}>
          + New Template
        </button>
      </div>

      {error && <div style={{ ...S.errorMsg, marginBottom: 16, fontSize: 13 }}>{error}</div>}

      {loading ? (
        <div style={{ textAlign: 'center', color: '#6b7280', padding: 40 }}>Loading…</div>
      ) : templates.length === 0 ? (
        <div style={S.emptyState}>
          <div style={{ fontSize: 15, marginBottom: 8 }}>No PDF templates yet</div>
          <div style={{ fontSize: 13 }}>Create a template for quotations, invoices, or delivery notes.</div>
        </div>
      ) : (
        templates.map((template) => (
          <div key={template.id} style={S.card}>
            <div style={S.cardBody}>
              <div style={S.cardTitle}>{template.name}</div>
              <div style={S.cardMeta}>
                {template.pageSize} · {template.orientation} · {template.body.length} blocks
              </div>
            </div>
            <div style={S.actions}>
              <button style={S.btnSecondary} onClick={() => handlePreview(template)}>
                Preview HTML
              </button>
              <button
                style={S.btnSecondary}
                onClick={() => void handleDownloadSample(template)}
                disabled={generating === template.id}
              >
                {generating === template.id ? 'Generating…' : 'Download Sample PDF'}
              </button>
              <button style={S.btnSecondary} onClick={() => setEditing(template)}>
                Edit
              </button>
              <button style={S.btnDanger} onClick={() => void handleDelete(template.id)}>
                Delete
              </button>
            </div>
          </div>
        ))
      )}

      {showCreate && (
        <TemplateEditorModal
          onSave={(partial) => void handleCreate(partial)}
          onClose={() => setShowCreate(false)}
        />
      )}

      {editing && (
        <TemplateEditorModal
          initial={editing}
          onSave={(partial) => void handleUpdate(editing.id, partial)}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
