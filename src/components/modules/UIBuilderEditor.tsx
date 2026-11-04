'use client';

/**
 * UI Builder Editor
 * 
 * Visual interface for adding/configuring:
 * - Toolbar buttons (page-level, open a form)
 * - Row action buttons (pre-fill a form field with the row's ID)
 * - Table widgets (live data from any table with filters + sum row)
 * - Column visibility rules (hide columns for specific roles)
 */

import React, { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { Button, Input, Select, Textarea, Modal, Badge, Card } from '@/components/ui';
import {
  Plus, Trash2, Save, LayoutTemplate, Table2, Eye, EyeOff,
  MousePointerClick, Columns, ChevronDown, ChevronUp
} from 'lucide-react';

interface PageOption { key: string; label: string; isCustom?: boolean; }
interface FormOption { id: string; name: string; slug: string; }
interface RoleOption { id: string; name: string; }

interface UIButton {
  id?: string;
  page_key: string;
  label: string;
  icon: string;
  placement: 'toolbar' | 'row_actions';
  form_id: string;
  prefill_field: string;
  visible_roles: string[];
  sort_order: number;
}

interface UITableWidget {
  id?: string;
  page_key: string;
  title: string;
  source_table: string;
  columns: Array<{ key: string; label: string; type: string }>;
  filters: Array<{ column: string; value: string }>;
  show_sum_row: boolean;
  sum_columns: string[];
  collapsible: boolean;
  default_collapsed: boolean;
  visible_roles: string[];
  sort_order: number;
}

interface VisibilityRule {
  id?: string;
  page_key: string;
  column_label: string;
  hidden_roles: string[];
}

interface UIBuilderEditorProps {
  tenantSlug: string;
  forms: FormOption[];
  roles: RoleOption[];
}

export function UIBuilderEditor({ tenantSlug, forms, roles }: UIBuilderEditorProps) {
  const [pages, setPages] = useState<PageOption[]>([]);
  const [selectedPage, setSelectedPage] = useState('');
  const [buttons, setButtons] = useState<UIButton[]>([]);
  const [tables, setTables] = useState<UITableWidget[]>([]);
  const [visibilityRules, setVisibilityRules] = useState<VisibilityRule[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [newButtonOpen, setNewButtonOpen] = useState(false);
  const [newTableOpen, setNewTableOpen] = useState(false);
  const [newVisOpen, setNewVisOpen] = useState(false);

  // Load pages
  useEffect(() => {
    void fetch(`/api/tenant/ui-builder?tenant=${tenantSlug}&resource=pages`)
      .then((r) => r.json())
      .then((d) => { setPages(d.pages ?? []); if (d.pages?.length) setSelectedPage(d.pages[0].key); })
      .catch(() => {});
  }, [tenantSlug]);

  // Load page config when selected page changes
  useEffect(() => {
    if (!selectedPage) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    void fetch(`/api/tenant/ui-builder?tenant=${tenantSlug}&pageKey=${encodeURIComponent(selectedPage)}`)
      .then((r) => r.json())
      .then((d) => {
        setButtons(d.buttons ?? []);
        setTables(d.tables ?? []);
        setVisibilityRules(d.visibility ?? []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [selectedPage, tenantSlug]);

  async function saveButton(btn: Omit<UIButton, 'id'>) {
    setSaving(true);
    try {
      await fetch(`/api/tenant/ui-builder?tenant=${tenantSlug}&resource=button`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(btn),
      });
      // Reload
      const d = await fetch(`/api/tenant/ui-builder?tenant=${tenantSlug}&pageKey=${selectedPage}`).then((r) => r.json());
      setButtons(d.buttons ?? []);
    } finally {
      setSaving(false);
    }
  }

  async function saveTable(tbl: Omit<UITableWidget, 'id'>) {
    setSaving(true);
    try {
      await fetch(`/api/tenant/ui-builder?tenant=${tenantSlug}&resource=table`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(tbl),
      });
      const d = await fetch(`/api/tenant/ui-builder?tenant=${tenantSlug}&pageKey=${selectedPage}`).then((r) => r.json());
      setTables(d.tables ?? []);
    } finally {
      setSaving(false);
    }
  }

  async function saveVisibility(rule: Omit<VisibilityRule, 'id'>) {
    setSaving(true);
    try {
      await fetch(`/api/tenant/ui-builder?tenant=${tenantSlug}&resource=visibility`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(rule),
      });
      const d = await fetch(`/api/tenant/ui-builder?tenant=${tenantSlug}&pageKey=${selectedPage}`).then((r) => r.json());
      setVisibilityRules(d.visibility ?? []);
    } finally {
      setSaving(false);
    }
  }

  async function deleteButton(id: string) {
    if (!confirm('Remove this button?')) return;
    await fetch(`/api/tenant/ui-builder?tenant=${tenantSlug}&resource=button&id=${id}`, { method: 'DELETE' });
    setButtons((prev) => prev.filter((b) => b.id !== id));
  }

  async function deleteTable(id: string) {
    if (!confirm('Remove this table widget?')) return;
    await fetch(`/api/tenant/ui-builder?tenant=${tenantSlug}&resource=table&id=${id}`, { method: 'DELETE' });
    setTables((prev) => prev.filter((t) => t.id !== id));
  }

  async function deleteVisibilityRule(id: string) {
    if (!confirm('Remove this visibility rule? The column will show for everyone again.')) return;
    await fetch(`/api/tenant/ui-builder?tenant=${tenantSlug}&resource=visibility&id=${id}`, { method: 'DELETE' });
    setVisibilityRules((prev) => prev.filter((r) => r.id !== id));
  }

  return (
    <div className="flex h-full">
      {/* Page picker sidebar */}
      <div className="w-56 flex-shrink-0 bg-white border-r border-slate-200 overflow-y-auto">
        <div className="p-3 border-b border-slate-200">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Pages</p>
        </div>
        <nav className="p-2 space-y-1">
          {pages.map((page) => (
            <button
              key={page.key}
              onClick={() => setSelectedPage(page.key)}
              className={cn(
                'w-full text-left px-3 py-2 rounded-lg text-sm transition-colors',
                selectedPage === page.key
                  ? 'bg-indigo-50 text-indigo-700 font-medium'
                  : 'text-slate-600 hover:bg-slate-50'
              )}
            >
              {page.label}
              {page.isCustom && (
                <Badge variant="info" className="ml-1.5 text-xs">Custom</Badge>
              )}
            </button>
          ))}
        </nav>
      </div>

      {/* Main canvas */}
      <div className="flex-1 overflow-y-auto bg-slate-50 p-6 space-y-6">
        {!selectedPage ? (
          <p className="text-slate-400 text-sm">Select a page to configure</p>
        ) : loading ? (
          <p className="text-slate-400 text-sm">Loading…</p>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">
                {pages.find((p) => p.key === selectedPage)?.label ?? selectedPage}
              </h2>
            </div>

            {/* Buttons section */}
            <Card padding={false}>
              <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <MousePointerClick className="w-4 h-4 text-slate-400" />
                  <h3 className="font-medium text-slate-800 text-sm">Buttons</h3>
                  <Badge variant="default">{buttons.length}</Badge>
                </div>
                <Button size="sm" variant="secondary" icon={<Plus className="w-3.5 h-3.5" />}
                  onClick={() => setNewButtonOpen(true)}>
                  Add button
                </Button>
              </div>
              {buttons.length === 0 ? (
                <p className="text-sm text-slate-400 py-8 text-center">No buttons on this page yet</p>
              ) : (
                <div className="divide-y divide-slate-100">
                  {buttons.map((btn) => (
                    <div key={btn.id} className="flex items-center gap-3 px-5 py-3">
                      <Badge variant={btn.placement === 'toolbar' ? 'info' : 'default'}>
                        {btn.placement === 'toolbar' ? 'Toolbar' : 'Row action'}
                      </Badge>
                      <span className="text-sm font-medium text-slate-700">{btn.label}</span>
                      {btn.form_id && (
                        <span className="text-xs text-slate-400">
                          → {forms.find((f) => f.id === btn.form_id)?.name ?? 'Unknown form'}
                        </span>
                      )}
                      <span className="ml-auto text-xs text-slate-400">
                        {btn.visible_roles.length === 0 ? 'All roles' : `${btn.visible_roles.length} role(s)`}
                      </span>
                      <button onClick={() => btn.id && deleteButton(btn.id)} className="text-slate-300 hover:text-red-500">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            {/* Table widgets section */}
            <Card padding={false}>
              <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <Table2 className="w-4 h-4 text-slate-400" />
                  <h3 className="font-medium text-slate-800 text-sm">Table widgets</h3>
                  <Badge variant="default">{tables.length}</Badge>
                </div>
                <Button size="sm" variant="secondary" icon={<Plus className="w-3.5 h-3.5" />}
                  onClick={() => setNewTableOpen(true)}>
                  Add table
                </Button>
              </div>
              {tables.length === 0 ? (
                <p className="text-sm text-slate-400 py-8 text-center">No table widgets yet</p>
              ) : (
                <div className="divide-y divide-slate-100">
                  {tables.map((tbl) => (
                    <div key={tbl.id} className="flex items-center gap-3 px-5 py-3">
                      <span className="text-sm font-medium text-slate-700">{tbl.title || tbl.source_table}</span>
                      <span className="text-xs text-slate-400">from {tbl.source_table}</span>
                      {tbl.show_sum_row && <Badge variant="success">Sum row</Badge>}
                      {tbl.collapsible && <Badge variant="default">Collapsible</Badge>}
                      <button onClick={() => tbl.id && deleteTable(tbl.id)} className="ml-auto text-slate-300 hover:text-red-500">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            {/* Column visibility */}
            <Card padding={false}>
              <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <EyeOff className="w-4 h-4 text-slate-400" />
                  <h3 className="font-medium text-slate-800 text-sm">Column visibility rules</h3>
                </div>
                <Button size="sm" variant="secondary" icon={<Plus className="w-3.5 h-3.5" />}
                  onClick={() => setNewVisOpen(true)}>
                  Add rule
                </Button>
              </div>
              {visibilityRules.length === 0 ? (
                <p className="text-sm text-slate-400 py-8 text-center">No visibility rules yet</p>
              ) : (
                <div className="divide-y divide-slate-100">
                  {visibilityRules.map((rule) => (
                    <div key={rule.id} className="flex items-center gap-3 px-5 py-3">
                      <span className="text-sm font-medium text-slate-700">&quot;{rule.column_label}&quot;</span>
                      <span className="text-xs text-slate-400">hidden for</span>
                      {rule.hidden_roles.map((r) => (
                        <Badge key={r} variant="warning">{r}</Badge>
                      ))}
                      <button onClick={() => rule.id && deleteVisibilityRule(rule.id)} className="ml-auto text-slate-300 hover:text-red-500">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </>
        )}
      </div>

      {/* New button modal */}
      <NewButtonModal
        open={newButtonOpen}
        onClose={() => setNewButtonOpen(false)}
        pageKey={selectedPage}
        forms={forms}
        roles={roles}
        onSave={(btn) => { saveButton(btn); setNewButtonOpen(false); }}
      />

      {/* New table widget modal */}
      <NewTableModal
        open={newTableOpen}
        onClose={() => setNewTableOpen(false)}
        pageKey={selectedPage}
        roles={roles}
        onSave={(tbl) => { saveTable(tbl); setNewTableOpen(false); }}
      />

      {/* New visibility rule modal */}
      <NewVisibilityModal
        open={newVisOpen}
        onClose={() => setNewVisOpen(false)}
        pageKey={selectedPage}
        roles={roles}
        onSave={(rule) => { saveVisibility(rule); setNewVisOpen(false); }}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// New button modal
// ─────────────────────────────────────────────────────────────

function NewButtonModal({ open, onClose, pageKey, forms, roles, onSave }: {
  open: boolean; onClose: () => void; pageKey: string;
  forms: FormOption[]; roles: RoleOption[];
  onSave: (btn: Omit<UIButton, 'id'>) => void;
}) {
  const [draft, setDraft] = useState<Omit<UIButton, 'id'>>({
    page_key: pageKey,
    label: '',
    icon: '',
    placement: 'toolbar',
    form_id: '',
    prefill_field: '',
    visible_roles: [],
    sort_order: 0,
  });

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setDraft((prev) => ({ ...prev, page_key: pageKey })); }, [pageKey]);

  return (
    <Modal open={open} onClose={onClose} title="Add button" size="md">
      <div className="space-y-4">
        <Input label="Button label" value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} required />
        <Input label="Icon (Lucide name)" value={draft.icon} onChange={(e) => setDraft({ ...draft, icon: e.target.value })} placeholder="e.g. plus-circle" />
        <Select
          label="Placement"
          value={draft.placement}
          onChange={(e) => setDraft({ ...draft, placement: e.target.value as UIButton['placement'] })}
          options={[
            { value: 'toolbar', label: 'Page toolbar (standalone)' },
            { value: 'row_actions', label: 'Row actions (per-row)' },
          ]}
        />
        <Select
          label="Opens form"
          value={draft.form_id}
          onChange={(e) => setDraft({ ...draft, form_id: e.target.value })}
          options={[{ value: '', label: '— None —' }, ...forms.map((f) => ({ value: f.id, label: f.name }))]}
        />
        {draft.placement === 'row_actions' && (
          <Input
            label="Pre-fill field key"
            value={draft.prefill_field}
            onChange={(e) => setDraft({ ...draft, prefill_field: e.target.value })}
            hint="Form field that will receive the row's ID when this button is clicked"
          />
        )}
        <div className="flex gap-3 justify-end">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={() => onSave(draft)}>Add button</Button>
        </div>
      </div>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────
// New table widget modal
// ─────────────────────────────────────────────────────────────

function NewTableModal({ open, onClose, pageKey, roles, onSave }: {
  open: boolean; onClose: () => void; pageKey: string;
  roles: RoleOption[];
  onSave: (tbl: Omit<UITableWidget, 'id'>) => void;
}) {
  const [draft, setDraft] = useState<Omit<UITableWidget, 'id'>>({
    page_key: pageKey,
    title: '',
    source_table: '',
    columns: [],
    filters: [],
    show_sum_row: false,
    sum_columns: [],
    collapsible: false,
    default_collapsed: false,
    visible_roles: [],
    sort_order: 0,
  });

  const [columnsJson, setColumnsJson] = useState('[]');
  const [filtersJson, setFiltersJson] = useState('[]');

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setDraft((prev) => ({ ...prev, page_key: pageKey })); }, [pageKey]);

  return (
    <Modal open={open} onClose={onClose} title="Add table widget" size="lg">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Input label="Title" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
          <Input label="Source table" value={draft.source_table} onChange={(e) => setDraft({ ...draft, source_table: e.target.value })} required placeholder="e.g. leads" />
        </div>
        <Textarea
          label="Columns (JSON)"
          value={columnsJson}
          onChange={(e) => setColumnsJson(e.target.value)}
          placeholder='[{"key": "title", "label": "Title", "type": "text"}, ...]'
        />
        <Textarea
          label="Filters (JSON, optional)"
          value={filtersJson}
          onChange={(e) => setFiltersJson(e.target.value)}
          placeholder='[{"column": "status", "value": "active"}]'
        />
        <div className="flex gap-4">
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={draft.show_sum_row} onChange={(e) => setDraft({ ...draft, show_sum_row: e.target.checked })}
              className="w-4 h-4 rounded border-slate-300 text-indigo-600" />
            Show sum row
          </label>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={draft.collapsible} onChange={(e) => setDraft({ ...draft, collapsible: e.target.checked })}
              className="w-4 h-4 rounded border-slate-300 text-indigo-600" />
            Collapsible
          </label>
        </div>
        <div className="flex gap-3 justify-end">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={() => {
            try {
              const tbl = {
                ...draft,
                columns: JSON.parse(columnsJson),
                filters: JSON.parse(filtersJson),
              };
              onSave(tbl);
            } catch { alert('Invalid JSON in columns or filters'); }
          }}>
            Add table widget
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────
// Column visibility modal
// ─────────────────────────────────────────────────────────────

function NewVisibilityModal({ open, onClose, pageKey, roles, onSave }: {
  open: boolean; onClose: () => void; pageKey: string;
  roles: RoleOption[];
  onSave: (rule: Omit<VisibilityRule, 'id'>) => void;
}) {
  const [columnLabel, setColumnLabel] = useState('');
  const [hiddenRoles, setHiddenRoles] = useState<string[]>([]);

  return (
    <Modal open={open} onClose={onClose} title="Add column visibility rule" size="sm">
      <div className="space-y-4">
        <Input
          label="Column header text (exact match)"
          value={columnLabel}
          onChange={(e) => setColumnLabel(e.target.value)}
          placeholder="e.g. Cost Price"
          hint="Type the exact column header as it appears in the table"
          required
        />
        <div>
          <p className="text-sm font-medium text-slate-700 mb-2">Hide for these roles:</p>
          <div className="space-y-2">
            {roles.map((role) => (
              <label key={role.id} className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={hiddenRoles.includes(role.name)}
                  onChange={(e) => {
                    setHiddenRoles((prev) =>
                      e.target.checked ? [...prev, role.name] : prev.filter((r) => r !== role.name)
                    );
                  }}
                  className="w-4 h-4 rounded border-slate-300 text-indigo-600"
                />
                {role.name}
              </label>
            ))}
          </div>
        </div>
        <div className="flex gap-3 justify-end">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={() => onSave({ page_key: pageKey, column_label: columnLabel, hidden_roles: hiddenRoles })}>
            Save rule
          </Button>
        </div>
      </div>
    </Modal>
  );
}
