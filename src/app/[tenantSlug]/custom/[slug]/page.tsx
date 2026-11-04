'use client';

import { useState, useEffect, use } from 'react';
import { PageHeader } from '@/components/layout/TenantLayout';
import { Button, Modal, Toast, EmptyState, Badge } from '@/components/ui';
import { DataTable, type Column } from '@/components/tables/DataTable';
import { DynamicForm } from '@/components/forms/DynamicForm';
import { Plus, Layers, Edit, Trash2, LayoutList, Columns } from 'lucide-react';

interface FormField {
  key: string;
  label: string;
  field_type: string;
  is_line_item: boolean;
  is_required: boolean;
  // JSONB from Postgres arrives pre-parsed through the API - an array
  // of {value, label} objects, not a JSON string. Kept loosely typed
  // since this codebase has been inconsistent about the exact shape.
  dropdown_type?: 'static' | 'dynamic';
  dropdown_static_options?: Array<{ value: string; label: string }> | string;
}

interface FormConfig {
  id: string;
  name: string;
  description: string;
  tab_label: string;
  slug: string;
  fields?: FormField[];
  pdf_template_url?: string;
  board_view_enabled?: boolean;
  board_group_by_field?: string;
  revisioning_enabled?: boolean;
}

interface Submission {
  id: string;
  submitted_at: string;
  submitted_by_name: string;
  is_test: boolean;
  header_data: Record<string, unknown>;
  thread_id?: string;
  revision_number?: number;
  is_latest?: boolean;
}

export default function CustomTabPage({
  params,
}: {
  params: Promise<{ tenantSlug: string; slug: string }>;
}) {
  const { tenantSlug, slug } = use(params);

  const [form, setForm] = useState<FormConfig | null>(null);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editSubmission, setEditSubmission] = useState<Submission | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [view, setView] = useState<'table' | 'board'>('table');
  const [historyThreadId, setHistoryThreadId] = useState<string | null>(null);

  async function loadForm() {
    const d = await fetch(`/api/tenant/form-builder?tenant=${tenantSlug}&slug=${slug}`).then(r => r.json());
    const found = (d.forms ?? []).find((f: FormConfig) => f.slug === slug);
    if (!found) return;

    const [formDetail, fieldsData] = await Promise.all([
      fetch(`/api/tenant/form-builder/${found.id}?tenant=${tenantSlug}`).then(r => r.json()),
      fetch(`/api/tenant/form-builder/${found.id}/fields?tenant=${tenantSlug}`).then(r => r.json()),
    ]);
    setForm({ ...formDetail.form, fields: fieldsData.fields ?? [] });
  }

  async function loadSubmissions() {
    if (!form) return;
    setLoading(true);
    const pageSize = view === 'board' ? 200 : 50;
    const d = await fetch(
      `/api/tenant/form-builder/submissions?tenant=${tenantSlug}&formId=${form.id}&page=${view === 'board' ? 1 : page}&pageSize=${pageSize}&isTest=false`
    ).then(r => r.json());
    setSubmissions(d.submissions ?? []);
    setTotal(d.total ?? 0);
    setLoading(false);
  }

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void loadForm(); }, [slug]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (form) void loadSubmissions(); }, [form, page, view]);

  async function handleSubmit(data: {
    formId: string;
    isTest: boolean;
    headerData: Record<string, unknown>;
    lineItems: unknown[];
  }) {
    let res: Response;

    if (editSubmission) {
      // This used to always POST here too, meaning "editing" a record
      // silently created a brand-new duplicate every time and left the
      // original completely untouched. Now it actually updates in
      // place — or, if this form tracks revisions, creates a proper
      // new revision instead of a disconnected duplicate.
      if (form?.revisioning_enabled) {
        res = await fetch(`/api/tenant/form-builder/submissions/${editSubmission.id}/revise?tenant=${tenantSlug}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ headerData: data.headerData, lineItems: data.lineItems }),
        });
      } else {
        res = await fetch(`/api/tenant/form-builder/submissions/${editSubmission.id}?tenant=${tenantSlug}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ headerData: data.headerData }),
        });
      }
    } else {
      res = await fetch(`/api/tenant/form-builder/submissions?tenant=${tenantSlug}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
    }

    if (res.ok) {
      setModalOpen(false);
      setEditSubmission(null);
      setToast({ message: editSubmission && form?.revisioning_enabled ? 'New revision saved' : 'Entry saved successfully', type: 'success' });
      loadSubmissions();
    } else {
      setToast({ message: 'Failed to save entry', type: 'error' });
    }
  }

  async function handleDelete(id: string) {
    const res = await fetch(
      `/api/tenant/form-builder/submissions/${id}?tenant=${tenantSlug}`,
      { method: 'DELETE' }
    );
    if (res.ok) {
      setDeleteId(null);
      setToast({ message: 'Entry deleted', type: 'success' });
      loadSubmissions();
    } else {
      setToast({ message: 'Failed to delete', type: 'error' });
    }
  }

  const title = form?.tab_label || form?.name || 'Loading…';

  // Build columns dynamically from form header fields
  const headerFields = (form?.fields ?? [])
    .filter(f => !f.is_line_item)
    .slice(0, 7);

  // Build DataTable columns from form fields
  const tableColumns: Column<Submission>[] = [
    ...headerFields.map(f => ({
      key: f.key,
      label: f.label,
      render: (_: unknown, sub: Submission) => {
        const val = sub.header_data?.[f.key];
        if (val === null || val === undefined || val === '') return <span className="text-slate-300">—</span>;
        if (typeof val === 'boolean') return val ? <Badge variant="success">Yes</Badge> : <Badge variant="default">No</Badge>;
        return <span>{String(val)}</span>;
      },
    })),
    {
      key: 'submitted_at',
      label: 'Created',
      type: 'date' as const,
    },
    ...(form?.revisioning_enabled ? [{
      key: 'revision_number',
      label: 'Rev',
      render: (_: unknown, sub: Submission) => {
        return <Badge variant="default">Rev {sub.revision_number ?? 1}</Badge>;
      },
    }] : []),
  ];

  return (
    <>
      <PageHeader
        title={title}
        description={form?.description}
        actions={
          form && (
            <>
              {form.board_view_enabled && form.board_group_by_field && (
                <div className="flex bg-slate-100 rounded-lg p-1 gap-1 mr-2">
                  {[
                    { mode: 'table' as const, icon: <LayoutList className="w-4 h-4" />, label: 'Table' },
                    { mode: 'board' as const, icon: <Columns className="w-4 h-4" />, label: 'Board' },
                  ].map(({ mode, icon, label }) => (
                    <button
                      key={mode}
                      onClick={() => setView(mode)}
                      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-sm transition-all ${
                        view === mode ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500'
                      }`}
                    >
                      {icon}
                      {label}
                    </button>
                  ))}
                </div>
              )}
              <Button
                icon={<Plus className="w-4 h-4" />}
                onClick={() => { setEditSubmission(null); setModalOpen(true); }}
              >
                Add {form.tab_label || form.name}
              </Button>
            </>
          )
        }
      />

      {!form ? (
        <div className="p-6">
          <EmptyState
            icon={<Layers className="w-12 h-12" />}
            title="Form not found"
            description={`No form found for "${slug}". Check your Form Builder settings.`}
          />
        </div>
      ) : view === 'board' && form.board_group_by_field ? (
        <BoardView
          form={form}
          submissions={submissions}
          groupByField={form.board_group_by_field}
          onCardMoved={loadSubmissions}
          onCardClick={(row) => { setEditSubmission(row); setModalOpen(true); }}
          tenantSlug={tenantSlug}
        />
      ) : (
        <DataTable<Submission>
          loading={loading}
          data={submissions}
          total={total}
          page={page}
          pageSize={50}
          onPageChange={setPage}
          searchable
          columns={tableColumns}
          rowActions={[
            {
              label: 'Edit',
              icon: <Edit className="w-3.5 h-3.5" />,
              onClick: (row) => {
                setEditSubmission(row);
                setModalOpen(true);
              },
            },
            ...(form?.revisioning_enabled ? [{
              label: 'History',
              icon: <Layers className="w-3.5 h-3.5" />,
              onClick: (row: Submission) => setHistoryThreadId(row.thread_id ?? row.id),
            }] : []),
            {
              label: 'Delete',
              icon: <Trash2 className="w-3.5 h-3.5" />,
              onClick: (row) => setDeleteId(row.id),
              variant: 'danger',
            },
          ]}
          emptyTitle={`No ${title} entries yet`}
          emptyDescription={`Add your first ${title} entry using the button above.`}
          emptyAction={
            <Button
              icon={<Plus className="w-4 h-4" />}
              onClick={() => setModalOpen(true)}
            >
              Add first entry
            </Button>
          }
        />
      )}

      {/* Add / Edit modal */}
      {form && (
        <Modal
          open={modalOpen}
          onClose={() => { setModalOpen(false); setEditSubmission(null); }}
          title={editSubmission ? `Edit ${title}` : `Add ${title}`}
          size="xl"
        >
          <DynamicForm
            form={form as never}
            tenantSlug={tenantSlug}
            initialHeaderData={editSubmission?.header_data}
            onSubmit={handleSubmit}
            onCancel={() => { setModalOpen(false); setEditSubmission(null); }}
          />
        </Modal>
      )}

      {/* Delete confirm */}
      {deleteId && (
        <Modal
          open={true}
          onClose={() => setDeleteId(null)}
          title="Delete entry"
          size="sm"
        >
          <p className="text-sm text-slate-600 mb-6">
            Are you sure you want to delete this entry? This cannot be undone.
          </p>
          <div className="flex gap-3 justify-end">
            <Button variant="secondary" onClick={() => setDeleteId(null)}>Cancel</Button>
            <Button variant="danger" onClick={() => handleDelete(deleteId)}>Delete</Button>
          </div>
        </Modal>
      )}

      {historyThreadId && form && (
        <HistoryModal
          tenantSlug={tenantSlug}
          threadId={historyThreadId}
          form={form}
          onClose={() => setHistoryThreadId(null)}
        />
      )}

      {toast && <Toast message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />}
    </>
  );
}

// ─────────────────────────────────────────────────────────────
// Board (Kanban) view
//
// Groups submissions into columns by the configured dropdown field's
// value, using that field's own option list to define column order.
// Dragging a card to a different column PATCHes just that one field in
// the submission's header_data, merged with everything else already
// there — the same "move a card" action anyone would expect from a
// real Kanban board.
// ─────────────────────────────────────────────────────────────

function BoardView({
  form,
  submissions,
  groupByField,
  onCardMoved,
  onCardClick,
  tenantSlug,
}: {
  form: FormConfig;
  submissions: Submission[];
  groupByField: string;
  onCardMoved: () => void;
  onCardClick: (row: Submission) => void;
  tenantSlug: string;
}) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);
  const [moving, setMoving] = useState(false);

  const field = (form.fields ?? []).find((f) => f.key === groupByField);
  let columnOptions: string[] = [];
  const rawOptions = field?.dropdown_static_options;
  if (Array.isArray(rawOptions)) {
    // The expected shape: JSONB from Postgres, already parsed by the
    // time it reaches the browser - an array of {value, label} objects.
    columnOptions = rawOptions.map((opt) => (typeof opt === 'string' ? opt : opt.value ?? opt.label ?? String(opt)));
  } else if (typeof rawOptions === 'string' && rawOptions) {
    // Defensive fallback - this codebase has been inconsistent about
    // whether this field is a real array or a JSON-encoded string.
    try {
      const parsed = JSON.parse(rawOptions);
      columnOptions = Array.isArray(parsed)
        ? parsed.map((opt) => (typeof opt === 'string' ? opt : opt.value ?? opt.label ?? String(opt)))
        : [];
    } catch {
      columnOptions = [];
    }
  }

  // Cards whose current value doesn't match any known column (e.g. the
  // field's options changed after some records were already saved)
  // still need somewhere to live, rather than silently vanishing from
  // the board entirely.
  const knownValues = new Set(columnOptions);
  const unassigned = submissions.filter((s) => {
    const v = s.header_data?.[groupByField];
    return v === undefined || v === null || v === '' || !knownValues.has(String(v));
  });
  const columns = unassigned.length > 0 ? [...columnOptions, '__unassigned__'] : columnOptions;

  function cardsForColumn(col: string): Submission[] {
    if (col === '__unassigned__') return unassigned;
    return submissions.filter((s) => String(s.header_data?.[groupByField] ?? '') === col);
  }

  async function moveCard(submissionId: string, newValue: string) {
    const submission = submissions.find((s) => s.id === submissionId);
    if (!submission) return;
    if (String(submission.header_data?.[groupByField] ?? '') === newValue) return; // dropped back in the same column

    setMoving(true);
    await fetch(`/api/tenant/form-builder/submissions/${submissionId}?tenant=${tenantSlug}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ headerData: { ...submission.header_data, [groupByField]: newValue } }),
    });
    setMoving(false);
    onCardMoved();
  }

  if (columns.length === 0) {
    return (
      <div className="p-6">
        <EmptyState
          icon={<Columns className="w-12 h-12" />}
          title="No columns to show"
          description={`"${field?.label ?? groupByField}" doesn't have any dropdown options configured yet — add some in Form Builder first.`}
        />
      </div>
    );
  }

  return (
    <div className="p-4 overflow-x-auto">
      <div className="flex gap-4 min-w-max">
        {columns.map((col) => {
          const cards = cardsForColumn(col);
          const isOver = dragOverColumn === col;
          return (
            <div
              key={col}
              onDragOver={(e) => { e.preventDefault(); setDragOverColumn(col); }}
              onDragLeave={() => setDragOverColumn((c) => (c === col ? null : c))}
              onDrop={(e) => {
                e.preventDefault();
                setDragOverColumn(null);
                if (draggingId) moveCard(draggingId, col);
              }}
              className={`w-72 flex-shrink-0 rounded-xl border transition-colors ${
                isOver ? 'border-indigo-400 bg-indigo-50/50' : 'border-slate-200 bg-slate-50'
              }`}
            >
              <div className="px-3 py-2.5 border-b border-slate-200 flex items-center justify-between">
                <span className="text-sm font-semibold text-slate-700">
                  {col === '__unassigned__' ? 'Unassigned' : col}
                </span>
                <span className="text-xs text-slate-400 bg-white rounded-full px-2 py-0.5 border border-slate-200">
                  {cards.length}
                </span>
              </div>
              <div className="p-2 space-y-2 min-h-[80px] max-h-[calc(100vh-260px)] overflow-y-auto">
                {cards.map((card) => (
                  <div
                    key={card.id}
                    draggable
                    onDragStart={() => setDraggingId(card.id)}
                    onDragEnd={() => setDraggingId(null)}
                    onClick={() => onCardClick(card)}
                    className={`bg-white border border-slate-200 rounded-lg p-3 cursor-grab active:cursor-grabbing hover:border-slate-300 hover:shadow-sm transition-all ${
                      draggingId === card.id ? 'opacity-40' : ''
                    } ${moving ? 'pointer-events-none' : ''}`}
                  >
                    {(form.fields ?? [])
                      .filter((f) => !f.is_line_item && f.key !== groupByField)
                      .slice(0, 3)
                      .map((f) => {
                        const val = card.header_data?.[f.key];
                        if (val === undefined || val === null || val === '') return null;
                        return (
                          <div key={f.key} className="text-sm text-slate-700 truncate">
                            {String(val)}
                          </div>
                        );
                      })}
                    <div className="text-xs text-slate-400 mt-1">
                      {new Date(card.submitted_at).toLocaleDateString()}
                    </div>
                  </div>
                ))}
                {cards.length === 0 && (
                  <div className="text-xs text-slate-300 text-center py-6">Drop a card here</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Revision history — every past version of a submission thread,
// oldest first, read-only. Restoring an old version isn't built here
// on purpose to keep scope contained — this is a viewer, not an undo
// mechanism.
// ─────────────────────────────────────────────────────────────

function HistoryModal({
  tenantSlug,
  threadId,
  form,
  onClose,
}: {
  tenantSlug: string;
  threadId: string;
  form: FormConfig;
  onClose: () => void;
}) {
  const [revisions, setRevisions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/tenant/form-builder/submissions/thread/${threadId}?tenant=${tenantSlug}`)
      .then((r) => r.json())
      .then((d) => setRevisions(d.revisions ?? []))
      .finally(() => setLoading(false));
  }, [tenantSlug, threadId]);

  const headerFields = (form.fields ?? []).filter((f) => !f.is_line_item).slice(0, 5);

  return (
    <Modal open={true} onClose={onClose} title="Revision history" size="lg">
      {loading ? (
        <p className="text-sm text-slate-400 p-6">Loading…</p>
      ) : revisions.length === 0 ? (
        <p className="text-sm text-slate-400 p-6">No revisions found.</p>
      ) : (
        <div className="space-y-3">
          {revisions.slice().reverse().map((rev) => (
            <div key={rev.id} className="border border-slate-200 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <Badge variant={rev.is_latest ? 'success' : 'default'}>
                  Rev {rev.revision_number ?? 1}{rev.is_latest ? ' (current)' : ''}
                </Badge>
                <span className="text-xs text-slate-400">
                  {rev.submitted_by_name} · {new Date(rev.submitted_at).toLocaleString()}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {headerFields.map((f) => {
                  const val = rev.header_data?.[f.key];
                  if (val === undefined || val === null || val === '') return null;
                  return (
                    <div key={f.key} className="text-sm">
                      <span className="text-slate-400">{f.label}: </span>
                      <span className="text-slate-700">{String(val)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
