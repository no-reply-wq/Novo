'use client';

import { useState, useEffect } from 'react';
import { PageHeader } from '@/components/layout/TenantLayout';
import { Button, Badge, Modal, Input, Select, Card, Toast } from '@/components/ui';
import { Plus, Edit, Trash2, GripVertical, Eye, EyeOff } from 'lucide-react';
import { useParams } from 'next/navigation';

interface TabForm {
  id: string;
  name: string;
  slug: string;
  description?: string;
  show_as_tab: boolean;
  tab_label: string;
  tab_icon: string;
  tab_sort_order: number;
  tab_visible_roles: string[];
}

export default function ManageTabsPage() {
  const { tenantSlug } = useParams<{ tenantSlug: string }>();
  const [forms, setForms] = useState<TabForm[]>([]);
  const [allForms, setAllForms] = useState<TabForm[]>([]);
  const [roles, setRoles] = useState<Array<{ id: string; name: string }>>([]);
  const [editId, setEditId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const [editDraft, setEditDraft] = useState<Partial<TabForm>>({});

  async function load() {
    const [formsData, rolesData] = await Promise.all([
      fetch(`/api/tenant/form-builder?tenant=${tenantSlug}`).then((r) => r.json()),
      fetch(`/api/tenant/masters?tenant=${tenantSlug}&type=roles`).then((r) => r.json()),
    ]);
    const allF = formsData.forms ?? [];
    setAllForms(allF);
    setForms(allF.filter((f: TabForm) => f.show_as_tab));
    setRoles(rolesData.items ?? []);
  }

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, []);

  const nonTabForms = allForms.filter((f) => !f.show_as_tab);

  async function saveTab(formId: string, data: Partial<TabForm>) {
    await fetch(`/api/tenant/form-builder/${formId}?tenant=${tenantSlug}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    setToast({ message: 'Tab updated', type: 'success' });
    load();
  }

  async function removeTab(formId: string) {
    await saveTab(formId, { show_as_tab: false });
    setToast({ message: 'Tab removed from sidebar', type: 'success' });
  }

  async function addTab(formId: string) {
    await saveTab(formId, { show_as_tab: true, tab_sort_order: forms.length * 10 + 10 });
    setAddOpen(false);
  }

  const editingForm = forms.find((f) => f.id === editId);

  return (
    <>
      <PageHeader
        title="Manage sidebar tabs"
        description="Control which custom forms appear as tabs in the sidebar navigation"
        breadcrumb={[{ label: 'Settings', href: `/${tenantSlug}/settings` }, { label: 'Tabs' }]}
        actions={
          <Button icon={<Plus className="w-4 h-4" />} onClick={() => setAddOpen(true)}>
            Add tab
          </Button>
        }
      />

      <div className="p-6 max-w-3xl">
        <Card padding={false}>
          {forms.length === 0 ? (
            <div className="py-16 text-center">
              <p className="text-slate-400 text-sm mb-4">No custom tabs yet.</p>
              <Button onClick={() => setAddOpen(true)} variant="secondary">
                Add your first tab
              </Button>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {forms
                .sort((a, b) => a.tab_sort_order - b.tab_sort_order)
                .map((form) => (
                  <div key={form.id} className="flex items-center gap-3 px-5 py-4">
                    <GripVertical className="w-4 h-4 text-slate-300 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800">{form.tab_label || form.name}</p>
                      <p className="text-xs text-slate-400">
                        Form: {form.name} · Slug: {form.slug}
                        {form.tab_visible_roles?.length > 0 && (
                          <> · Visible to: {form.tab_visible_roles.join(', ')}</>
                        )}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="ghost" icon={<Edit className="w-3.5 h-3.5" />}
                        onClick={() => { setEditId(form.id); setEditDraft({ tab_label: form.tab_label, tab_icon: form.tab_icon, tab_sort_order: form.tab_sort_order, tab_visible_roles: form.tab_visible_roles }); }}>
                        Edit
                      </Button>
                      <Button size="sm" variant="ghost" icon={<EyeOff className="w-3.5 h-3.5" />}
                        onClick={() => removeTab(form.id)}>
                        Remove
                      </Button>
                    </div>
                  </div>
                ))}
            </div>
          )}
        </Card>
      </div>

      {/* Add tab modal */}
      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Add form as sidebar tab" size="md">
        <p className="text-sm text-slate-500 mb-4">
          Select an existing form to expose as a sidebar tab. The form&apos;s Add/Edit/Delete interface will be accessible from the sidebar.
        </p>
        {nonTabForms.length === 0 ? (
          <p className="text-sm text-slate-400">
            All forms are already tabs, or no forms exist yet. Create a form in Form Builder first.
          </p>
        ) : (
          <div className="space-y-2">
            {nonTabForms.map((form) => (
              <div
                key={form.id}
                className="flex items-center justify-between p-3 border border-slate-200 rounded-lg hover:border-indigo-300 transition-colors"
              >
                <div>
                  <p className="text-sm font-medium text-slate-700">{form.name}</p>
                  <p className="text-xs text-slate-400">{form.description}</p>
                </div>
                <Button size="sm" onClick={() => addTab(form.id)}>Add</Button>
              </div>
            ))}
          </div>
        )}
      </Modal>

      {/* Edit tab modal */}
      <Modal open={!!editId} onClose={() => setEditId(null)} title="Edit tab settings" size="md">
        <div className="space-y-4">
          <Input label="Tab label" value={editDraft.tab_label ?? ''} onChange={(e) => setEditDraft({ ...editDraft, tab_label: e.target.value })} />
          <Input label="Tab icon (Lucide name)" value={editDraft.tab_icon ?? ''} onChange={(e) => setEditDraft({ ...editDraft, tab_icon: e.target.value })} placeholder="e.g. file-text" />
          <Input label="Sort order" type="number" value={String(editDraft.tab_sort_order ?? 0)} onChange={(e) => setEditDraft({ ...editDraft, tab_sort_order: parseInt(e.target.value) })} hint="Lower numbers appear first" />
          <div className="flex gap-3 justify-end mt-4">
            <Button variant="secondary" onClick={() => setEditId(null)}>Cancel</Button>
            <Button onClick={() => { editId && saveTab(editId, editDraft); setEditId(null); }}>Save</Button>
          </div>
        </div>
      </Modal>

      {toast && <Toast message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />}
    </>
  );
}
