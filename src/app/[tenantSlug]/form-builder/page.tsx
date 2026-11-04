'use client';

import { useState, useEffect } from 'react';
import { PageHeader } from '@/components/layout/TenantLayout';
import { Button, Badge, Modal, Card, EmptyState, Toast } from '@/components/ui';
import { Plus, Edit, Eye, Settings, Layers, Database, FileText, Trash2 } from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';
import { FormBuilderEditor, type FieldDraft, type FormDraft } from '@/components/modules/FormBuilderEditor';
import { DynamicForm, type FormConfig as DynamicFormConfig } from '@/components/forms/DynamicForm';
import { DataTable } from '@/components/tables/DataTable';
import { formatDate } from '@/lib/utils';

interface FormConfig {
  id: string;
  name: string;
  slug: string;
  description: string;
  category: string;
  show_as_tab: boolean;
  is_master?: boolean;
  tab_label: string;
  tab_icon?: string;
  pdf_template_url?: string;
  autofill_source_field?: string;
  autofill_child_table?: string;
  autofill_link_column?: string;
  board_view_enabled?: boolean;
  board_group_by_field?: string;
  revisioning_enabled?: boolean;
  active: boolean;
  created_at: string;
  updated_at: string;
  fields?: FieldDraft[];
}

/** Convert a FormBuilderEditor draft to DynamicForm's FormConfig at preview time.
 *  The only structural difference is dropdown_static_options (JSON string → parsed array). */
function toDynamicFormConfig(form: FormConfig): DynamicFormConfig {
  return {
    ...form,
    fields: (form.fields ?? []).map((f) => ({
      ...f,
      dropdown_static_options: (() => {
        try { return typeof f.dropdown_static_options === 'string' ? JSON.parse(f.dropdown_static_options) : (f.dropdown_static_options ?? []); }
        catch { return []; }
      })(),
    })),
  };
}

export default function FormBuilderPage() {
  const { tenantSlug } = useParams<{ tenantSlug: string }>();
  const [forms, setForms] = useState<FormConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<'list' | 'editor' | 'preview' | 'data'>('list');
  const [selectedForm, setSelectedForm] = useState<FormConfig | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [submissions, setSubmissions] = useState<unknown[]>([]);

  async function loadForms() {
    setLoading(true);
    try {
      const res = await fetch(`/api/tenant/form-builder?tenant=${tenantSlug}`);
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        console.error('Failed to load forms:', res.status, text);
        setForms([]);
        return;
      }
      const d = await res.json();
      setForms(d.forms ?? []);
    } catch (e) {
      console.error('Failed to load forms:', e);
      setForms([]);
    } finally {
      setLoading(false);
    }
  }

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void loadForms(); }, []);

  async function loadFormWithFields(formId: string) {
    const [formRes, fieldsRes] = await Promise.all([
      fetch(`/api/tenant/form-builder/${formId}?tenant=${tenantSlug}`),
      fetch(`/api/tenant/form-builder/${formId}/fields?tenant=${tenantSlug}`),
    ]);
    if (!formRes.ok || !fieldsRes.ok) {
      const formErr = !formRes.ok ? await formRes.text().catch(() => '') : '';
      const fieldsErr = !fieldsRes.ok ? await fieldsRes.text().catch(() => '') : '';
      console.error('Failed to load form:', { formStatus: formRes.status, formErr, fieldsStatus: fieldsRes.status, fieldsErr });
      throw new Error('Failed to load form or its fields — check the console for details');
    }
    const formData = await formRes.json();
    const fieldsData = await fieldsRes.json();
    return { ...formData.form, fields: fieldsData.fields ?? [] };
  }

  async function loadSubmissions(formId: string) {
    const d = await fetch(`/api/tenant/form-builder/submissions?tenant=${tenantSlug}&formId=${formId}`).then((r) => r.json());
    setSubmissions(d.submissions ?? []);
  }

  async function openEditor(form?: FormConfig) {
    if (form) {
      try {
        const full =
          await loadFormWithFields(form.id);
        setSelectedForm(full);
      } catch (e) {
        console.error(e);
        setToast({ message: 'Failed to load this form for editing', type: 'error' });
        return;
      }
    } else {
      setSelectedForm(null);
    }
    setMode('editor');
  }

  async function openPreview(form: FormConfig) {
    try {
      const full = await loadFormWithFields(form.id);
      setSelectedForm(full);
      setMode('preview');
    } catch (e) {
      console.error(e);
      setToast({ message: 'Failed to load this form for preview', type: 'error' });
    }
  }

  async function openData(form: FormConfig) {
    setSelectedForm(form);
    await loadSubmissions(form.id);
    setMode('data');
  }

  async function handleSaveForm(formData: FormDraft, fields: FieldDraft[]) {
    const method = selectedForm?.id ? 'PATCH' : 'POST';
    const url = selectedForm?.id
      ? `/api/tenant/form-builder/${selectedForm.id}?tenant=${tenantSlug}`
      : `/api/tenant/form-builder?tenant=${tenantSlug}`;

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...formData, fields }),
    });

    let formId = selectedForm?.id;
    if (!formId && res.ok) {
      const d = await res.json().catch(() => ({}));
      formId = d.form?.id ?? d.id;
    }

    if (formId && fields.length > 0) {
      await fetch(`/api/tenant/form-builder/${formId}/fields?tenant=${tenantSlug}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields }),
      });
    }

    loadForms();
    setMode('list');
  }

  async function handleSubmitForm(data: {
    formId: string; isTest: boolean; headerData: Record<string, unknown>; lineItems: unknown[];
  }) {
    await fetch(`/api/tenant/form-builder/submissions?tenant=${tenantSlug}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    setMode('list');
  }

  async function handleDeleteForm(form: FormConfig) {
    if (!confirm(`Delete "${form.name}"? Past submissions are kept, but the form and any sidebar tab it powers will disappear.`)) return;
    await fetch(`/api/tenant/form-builder/${form.id}?tenant=${tenantSlug}`, { method: 'DELETE' });
    loadForms();
  }

  if (mode === 'editor') {
    return (
      <div className="flex flex-col h-full">
        <PageHeader
          title={selectedForm?.name ? `Edit: ${selectedForm.name}` : 'New form'}
          breadcrumb={[
            { label: 'Form Builder', href: `/${tenantSlug}/form-builder` },
            { label: selectedForm?.name ?? 'New form' },
          ]}
        />
        <div className="flex-1 overflow-hidden">
          <FormBuilderEditor
            tenantSlug={tenantSlug}
            initialForm={selectedForm ?? undefined}
            onSave={handleSaveForm}
            onBack={() => setMode('list')}
          />
        </div>
      </div>
    );
  }

  if (mode === 'preview' && selectedForm?.fields) {
    return (
      <div>
        <PageHeader
          title={`Preview: ${selectedForm.name}`}
          breadcrumb={[
            { label: 'Form Builder', href: `/${tenantSlug}/form-builder` },
            { label: 'Preview' },
          ]}
          actions={<Button variant="secondary" onClick={() => setMode('list')}>Back to forms</Button>}
        />
        <div className="p-6 max-w-4xl">
          <DynamicForm
            form={toDynamicFormConfig(selectedForm)}
            tenantSlug={tenantSlug}
            onSubmit={handleSubmitForm}
            onCancel={() => setMode('list')}
          />
        </div>
      </div>
    );
  }

  if (mode === 'data' && selectedForm) {
    return (
      <div>
        <PageHeader
          title={selectedForm.name}
          breadcrumb={[
            { label: 'Form Builder', href: `/${tenantSlug}/form-builder` },
            { label: selectedForm.name },
          ]}
          actions={
            <>
              <Button variant="secondary" onClick={() => setMode('list')}>Back</Button>
              <Button icon={<Plus className="w-4 h-4" />} onClick={() => openPreview(selectedForm)}>
                Add entry
              </Button>
            </>
          }
        />
        <DataTable
          loading={false}
          data={submissions as Record<string, unknown>[]}
          total={submissions.length}
          columns={[
            { key: 'submitted_at', label: 'Submitted', type: 'date' },
            { key: 'submitted_by_name', label: 'By' },
            { key: 'is_test', label: 'Test', render: (v) => v ? <Badge variant="warning">Test</Badge> : null },
          ]}
          emptyTitle="No submissions"
          emptyAction={<Button onClick={() => openPreview(selectedForm)}>Add first entry</Button>}
        />
      </div>
    );
  }

  // List view
  return (
    <>
      <PageHeader
        title="Form Builder"
        description="Create custom data-entry forms with automatic Add/Edit/Delete interfaces"
        actions={
          <Button icon={<Plus className="w-4 h-4" />} onClick={() => openEditor()}>
            New form
          </Button>
        }
      />

      <div className="p-6">
        {loading ? (
          <p className="text-slate-400">Loading…</p>
        ) : forms.length === 0 ? (
          <EmptyState
            icon={<Layers className="w-12 h-12" />}
            title="No forms yet"
            description="Create your first form to start collecting structured data without writing any code."
            action={<Button icon={<Plus className="w-4 h-4" />} onClick={() => openEditor()}>Create first form</Button>}
          />
        ) : (
          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Form</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Category</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Type</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Updated</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {forms.map((form) => (
                  <tr key={form.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w8 h-8 bg-indigo-50 rounded-lg flex items-center justify-center flex-shrink-0">
                          <Layers className="w-4 h-4 text-indigo-600" />
                        </div>
                        <div>
                          <p className="font-medium text-slate-900">{form.name}</p>
                          {form.description && (
                            <p className="text-xs text-slate-400 truncate max-w-xs">{form.description}</p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-500">{form.category || '—'}</td>
                    <td className="px-4 py-3">
                      {form.is_master
                        ? <Badge variant="default">Master</Badge>
                        : form.show_as_tab
                        ? <Badge variant="success">Sidebar tab</Badge>
                        : <span className="text-slate-400 text-xs">Standard</span>}
                    </td>
                    <td className="px-4 py-3 text-slate-400 text-xs">{formatDate(form.updated_at)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 justify-end">
                        <Button size="sm" variant="ghost" icon={<Eye className="w-3.5 h-3.5" />}
                          onClick={() => openPreview(form)}>Preview</Button>
                        <Button size="sm" variant="ghost" icon={<Database className="w4 h-4" />}
                          onClick={() => openData(form)}>Data</Button>
                        <Button size="sm" variant="ghost" icon={<Edit className="w-3.5 h-3.5" />}
                          onClick={() => openEditor(form)}>Edit</Button>
                        <Button size="sm" variant="ghost" icon={<Trash2 className="w-3.5 h-3.5" />}
                          onClick={() => handleDeleteForm(form)}>Delete</Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {toast && <Toast message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />}
    </>
  );
}
