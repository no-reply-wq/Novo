'use client';

import React, { useState, useEffect, useLayoutEffect, useCallback, useRef } from 'react';
import { useParams } from 'next/navigation';
import type { WorkflowDef, ActionDef, ActionType, TriggerEvent } from '@/platform/contracts/rules';
import { ActionPicker } from '@/components/builder/ActionPicker';
import { StepConfigDrawer } from '@/components/builder/StepConfigDrawer';
import type { FieldHint } from '@/components/builder/ExpressionEditor';

// ─── Types ────────────────────────────────────────────────────────────────────

type InsertPosition = { afterId: string | null; parentId?: string };

const ACTION_TYPE_ICONS: Record<ActionType, string> = {
  create_record: '➕',
  update_record: '✏️',
  delete_record: '🗑',
  run_query: '🗄',
  set_variable: '📌',
  if_else: '🔀',
  switch: '⚡',
  for_each: '🔁',
  try_catch: '🛡',
  call_api: '🌐',
  send_email: '📧',
  send_whatsapp: '💬',
  generate_pdf: '📄',
  create_barcode: '📊',
  post_stock: '📦',
  convert_to: '🔄',
  start_approval: '✅',
  wait_delay: '⏱',
  notify_user: '🔔',
  show_toast: '🍞',
  navigate: '🧭',
  run_script: '⚙️',
};

const TRIGGER_OPTIONS: Array<{ value: TriggerEvent; label: string }> = [
  { value: 'record_created', label: 'Record Created' },
  { value: 'record_updated', label: 'Record Updated' },
  { value: 'record_deleted', label: 'Record Deleted' },
  { value: 'field_changed', label: 'Field Changed' },
  { value: 'status_changed', label: 'Status Changed' },
  { value: 'approval_decided', label: 'Approval Decided' },
  { value: 'form_submitted', label: 'Form Submitted' },
  { value: 'button_clicked', label: 'Button Clicked' },
  { value: 'schedule', label: 'Schedule (Cron)' },
  { value: 'webhook_incoming', label: 'Webhook Incoming' },
  { value: 'whatsapp_message', label: 'WhatsApp Message' },
  { value: 'email_received', label: 'Email Received' },
];

// ─── AddStepButton ────────────────────────────────────────────────────────────

function AddStepButton({ onClick }: { onClick: () => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0 }}>
      <div
        style={{
          width: 2,
          height: 16,
          background: 'var(--border, #e2e8f0)',
        }}
      />
      <button
        onClick={onClick}
        title="Add step"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 28,
          height: 28,
          borderRadius: '50%',
          border: '1px dashed var(--border, #e2e8f0)',
          background: 'var(--card-bg, #fff)',
          cursor: 'pointer',
          fontSize: 14,
          color: 'var(--muted-fg, #64748b)',
          transition: 'border-color 0.15s, background 0.15s',
        }}
        onMouseEnter={(e) => {
          const btn = e.currentTarget;
          btn.style.borderColor = 'var(--accent, #6366f1)';
          btn.style.background = 'var(--accent-muted, #ede9fe)';
          btn.style.color = 'var(--accent, #6366f1)';
        }}
        onMouseLeave={(e) => {
          const btn = e.currentTarget;
          btn.style.borderColor = 'var(--border, #e2e8f0)';
          btn.style.background = 'var(--card-bg, #fff)';
          btn.style.color = 'var(--muted-fg, #64748b)';
        }}
      >
        +
      </button>
      <div style={{ width: 2, height: 16, background: 'var(--border, #e2e8f0)' }} />
    </div>
  );
}

// ─── Step card ────────────────────────────────────────────────────────────────

interface StepCardProps {
  step: ActionDef;
  onSelect: () => void;
  onDelete: () => void;
  selected: boolean;
}

function StepCard({ step, onSelect, onDelete, selected }: StepCardProps) {
  const icon = ACTION_TYPE_ICONS[step.actionType] ?? '•';
  const label =
    step.label ??
    step.actionType.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

  return (
    <div
      onClick={onSelect}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') onSelect();
      }}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '10px 14px',
        border: `1px solid ${selected ? 'var(--accent, #6366f1)' : 'var(--border, #e2e8f0)'}`,
        borderRadius: 8,
        background: selected ? 'var(--accent-muted, #ede9fe)' : 'var(--card-bg, #fff)',
        cursor: 'pointer',
        width: '100%',
        boxSizing: 'border-box',
      }}
    >
      <span style={{ fontSize: 18, flexShrink: 0 }}>{icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: 0, fontSize: 13, fontWeight: 500 }}>{label}</p>
        <p
          style={{
            margin: 0,
            fontSize: 11,
            color: 'var(--muted-fg, #64748b)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {step.actionType}
        </p>
      </div>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        aria-label="Delete step"
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          color: 'var(--muted-fg, #64748b)',
          fontSize: 14,
          padding: '2px 4px',
          flexShrink: 0,
        }}
      >
        ×
      </button>
    </div>
  );
}

// ─── V2 step renderers ───────────────────────────────────────────────────────

/**
 * Renders a visual if/else branch container.
 * Children with config.branch === 'then' | 'else' are grouped in columns.
 */
function IfElseBranchView({
  step,
  children,
  selected,
  onSelectChild,
  onDeleteChild,
}: {
  step: ActionDef;
  children: ActionDef[];
  selected: ActionDef | null;
  onSelectChild: (s: ActionDef) => void;
  onDeleteChild: (id: string) => void;
}) {
  const thenSteps = children.filter((c) => c.config['branch'] === 'then');
  const elseSteps = children.filter((c) => c.config['branch'] === 'else');

  return (
    <div
      style={{
        width: '100%',
        border: '1px solid #818cf8',
        borderRadius: 10,
        overflow: 'hidden',
        marginBottom: 2,
      }}
    >
      {/* Header */}
      <div
        style={{
          background: '#ede9fe',
          padding: '8px 14px',
          fontWeight: 600,
          fontSize: 13,
          color: '#4f46e5',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        🔀 {step.label ?? 'If / Else'}
        {Boolean(step.config['condition']) && (
          <code
            style={{
              fontSize: 11,
              background: '#ddd6fe',
              padding: '1px 6px',
              borderRadius: 4,
              fontWeight: 400,
              maxWidth: 200,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {String(step.config['condition'])}
          </code>
        )}
      </div>
      {/* Two columns */}
      <div style={{ display: 'flex', borderTop: '1px solid #c7d2fe' }}>
        {/* True branch */}
        <div style={{ flex: 1, padding: '10px 12px', borderRight: '1px solid #c7d2fe' }}>
          <p
            style={{
              margin: '0 0 8px',
              fontSize: 11,
              fontWeight: 700,
              color: '#16a34a',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
            }}
          >
            Then
          </p>
          {thenSteps.length === 0 && (
            <p style={{ fontSize: 12, color: '#94a3b8', margin: 0 }}>Empty</p>
          )}
          {thenSteps.map((s) => (
            <StepCard
              key={s.id}
              step={s}
              selected={selected?.id === s.id}
              onSelect={() => onSelectChild(s)}
              onDelete={() => onDeleteChild(s.id)}
            />
          ))}
        </div>
        {/* False branch */}
        <div style={{ flex: 1, padding: '10px 12px' }}>
          <p
            style={{
              margin: '0 0 8px',
              fontSize: 11,
              fontWeight: 700,
              color: '#dc2626',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
            }}
          >
            Else
          </p>
          {elseSteps.length === 0 && (
            <p style={{ fontSize: 12, color: '#94a3b8', margin: 0 }}>Empty</p>
          )}
          {elseSteps.map((s) => (
            <StepCard
              key={s.id}
              step={s}
              selected={selected?.id === s.id}
              onSelect={() => onSelectChild(s)}
              onDelete={() => onDeleteChild(s.id)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * Renders a for_each loop container with indented sub-steps.
 */
function ForEachView({
  step,
  children,
  selected,
  onSelectChild,
  onDeleteChild,
}: {
  step: ActionDef;
  children: ActionDef[];
  selected: ActionDef | null;
  onSelectChild: (s: ActionDef) => void;
  onDeleteChild: (id: string) => void;
}) {
  return (
    <div
      style={{
        width: '100%',
        border: '1px solid #93c5fd',
        borderRadius: 10,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          background: '#eff6ff',
          padding: '8px 14px',
          fontWeight: 600,
          fontSize: 13,
          color: '#1d4ed8',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        🔁 {step.label ?? 'For Each'}
        {Boolean(step.config['items']) && (
          <code
            style={{
              fontSize: 11,
              background: '#dbeafe',
              padding: '1px 6px',
              borderRadius: 4,
              fontWeight: 400,
            }}
          >
            {String(step.config['items'])}
          </code>
        )}
        {Boolean(step.config['varName']) && (
          <span style={{ fontSize: 11, color: '#3b82f6' }}>
            as <strong>{String(step.config['varName'])}</strong>
          </span>
        )}
      </div>
      <div
        style={{
          borderTop: '1px solid #bfdbfe',
          padding: '10px 12px 10px 24px',
          borderLeft: '3px solid #93c5fd',
          marginLeft: 12,
        }}
      >
        {children.length === 0 && (
          <p style={{ fontSize: 12, color: '#94a3b8', margin: 0 }}>No sub-steps</p>
        )}
        {children.map((s) => (
          <StepCard
            key={s.id}
            step={s}
            selected={selected?.id === s.id}
            onSelect={() => onSelectChild(s)}
            onDelete={() => onDeleteChild(s.id)}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * Renders a transaction block with a bordered group.
 */
function TransactionView({
  step,
  children,
  selected,
  onSelectChild,
  onDeleteChild,
}: {
  step: ActionDef;
  children: ActionDef[];
  selected: ActionDef | null;
  onSelectChild: (s: ActionDef) => void;
  onDeleteChild: (id: string) => void;
}) {
  return (
    <div
      style={{
        width: '100%',
        border: '2px dashed #a78bfa',
        borderRadius: 10,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          background: '#faf5ff',
          padding: '8px 14px',
          fontWeight: 600,
          fontSize: 13,
          color: '#7c3aed',
          borderBottom: '1px solid #ddd6fe',
        }}
      >
        🔒 {step.label ?? 'Transaction'}{' '}
        <span style={{ fontSize: 11, fontWeight: 400, color: '#a78bfa' }}>
          (all or nothing)
        </span>
      </div>
      <div style={{ padding: '10px 12px' }}>
        {children.length === 0 && (
          <p style={{ fontSize: 12, color: '#94a3b8', margin: 0 }}>No steps</p>
        )}
        {children.map((s) => (
          <StepCard
            key={s.id}
            step={s}
            selected={selected?.id === s.id}
            onSelect={() => onSelectChild(s)}
            onDelete={() => onDeleteChild(s.id)}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * Renders a wait_approval step with flow + timeout config.
 */
function WaitApprovalView({ step }: { step: ActionDef }) {
  return (
    <div
      style={{
        width: '100%',
        border: '1px solid #fbbf24',
        borderRadius: 10,
        padding: '10px 14px',
        background: '#fffbeb',
      }}
    >
      <div style={{ fontWeight: 600, fontSize: 13, color: '#b45309', marginBottom: 6 }}>
        ✅ {step.label ?? 'Wait for Approval'}
      </div>
      {Boolean(step.config['chainId']) && (
        <div style={{ fontSize: 12, color: '#78350f' }}>
          Flow ID: <code>{String(step.config['chainId'])}</code>
        </div>
      )}
      {Boolean(step.config['timeoutHours']) && (
        <div style={{ fontSize: 12, color: '#78350f' }}>
          Timeout: {String(step.config['timeoutHours'])}h →{' '}
          {String(step.config['onTimeout'] ?? 'auto_reject')}
        </div>
      )}
    </div>
  );
}

// ─── Composite step renderer ──────────────────────────────────────────────────

/**
 * Routes a step to its v2 visual renderer if it's a compound type,
 * otherwise falls back to the standard StepCard.
 */
function StepRenderer({
  step,
  allActions,
  selected,
  onSelect,
  onDelete,
  onSelectChild,
  onDeleteChild,
}: {
  step: ActionDef;
  allActions: ActionDef[];
  selected: ActionDef | null;
  onSelect: () => void;
  onDelete: () => void;
  onSelectChild: (s: ActionDef) => void;
  onDeleteChild: (id: string) => void;
}) {
  const children = allActions
    .filter((a) => a.parentId === step.id)
    .sort((a, b) => a.rank - b.rank);

  if (step.actionType === 'if_else') {
    return (
      <>
        <div
          onClick={onSelect}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onSelect(); }}
          style={{ width: '100%', cursor: 'pointer' }}
        >
          <IfElseBranchView
            step={step}
            children={children}
            selected={selected}
            onSelectChild={onSelectChild}
            onDeleteChild={onDeleteChild}
          />
        </div>
      </>
    );
  }

  if (step.actionType === 'for_each') {
    return (
      <div
        onClick={onSelect}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onSelect(); }}
        style={{ width: '100%', cursor: 'pointer' }}
      >
        <ForEachView
          step={step}
          children={children}
          selected={selected}
          onSelectChild={onSelectChild}
          onDeleteChild={onDeleteChild}
        />
      </div>
    );
  }

  if (step.actionType === 'try_catch') {
    return (
      <div style={{ width: '100%' }}>
        <TransactionView
          step={{ ...step, label: step.label ?? 'Try / Catch' }}
          children={children}
          selected={selected}
          onSelectChild={onSelectChild}
          onDeleteChild={onDeleteChild}
        />
      </div>
    );
  }

  if (step.actionType === 'start_approval') {
    return (
      <div
        onClick={onSelect}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onSelect(); }}
        style={{ width: '100%', cursor: 'pointer' }}
      >
        <WaitApprovalView step={step} />
      </div>
    );
  }

  return (
    <StepCard
      step={step}
      selected={selected?.id === step.id}
      onSelect={onSelect}
      onDelete={onDelete}
    />
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function WorkflowDetailPage() {
  const { appId, workflowId } = useParams<{ appId: string; workflowId: string }>();
  const [workflow, setWorkflow] = useState<WorkflowDef | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pickerPos, setPickerPos] = useState<InsertPosition | null>(null);
  const [selectedStep, setSelectedStep] = useState<ActionDef | null>(null);
  const [showTriggerConfig, setShowTriggerConfig] = useState(false);

  const fieldHints: FieldHint[] = [
    { apiKey: 'record', label: 'Trigger record', type: 'object' },
    { apiKey: 'user', label: 'Current user', type: 'object' },
    { apiKey: 'vars', label: 'Variables', type: 'object' },
  ];

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/builder/apps/${appId}/workflows/${workflowId}`);
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as { workflow: WorkflowDef };
      setWorkflow(data.workflow);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [appId, workflowId]);

  const loadRef = useRef(load);
  useLayoutEffect(() => { loadRef.current = load; }, [load]);
  useEffect(() => {
    loadRef.current().catch((e: unknown) => setError(String(e)));
  }, [appId, workflowId]);

  async function save(updated: WorkflowDef) {
    setSaving(true);
    try {
      await fetch(`/api/builder/apps/${appId}/workflows/${workflowId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated),
      });
    } finally {
      setSaving(false);
    }
  }

  function addStep(type: ActionType, pos: InsertPosition) {
    if (!workflow) return;
    const newStep: ActionDef = {
      id: `step_${Date.now()}`,
      workflowId: workflow.id,
      parentId: pos.parentId,
      rank: 0,
      actionType: type,
      config: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    // Insert after the specified step
    const afterIndex = pos.afterId
      ? workflow.actions.findIndex((a) => a.id === pos.afterId)
      : -1;

    const topLevel = workflow.actions.filter((a) => !a.parentId);
    const topAfterIdx = pos.afterId ? topLevel.findIndex((a) => a.id === pos.afterId) : -1;
    const before = topLevel.slice(0, topAfterIdx + 1);
    const after = topLevel.slice(topAfterIdx + 1);
    const updated = {
      ...workflow,
      actions: [...before, newStep, ...after].map((a, i) => ({ ...a, rank: i })),
    };
    setWorkflow(updated);
    void save(updated);
    setPickerPos(null);
    setSelectedStep(newStep);
  }

  function deleteStep(id: string) {
    if (!workflow) return;
    const updated = { ...workflow, actions: workflow.actions.filter((a) => a.id !== id) };
    setWorkflow(updated);
    void save(updated);
    if (selectedStep?.id === id) setSelectedStep(null);
  }

  function updateStepConfig(id: string, config: Record<string, unknown>) {
    if (!workflow) return;
    const updated = {
      ...workflow,
      actions: workflow.actions.map((a) => (a.id === id ? { ...a, config } : a)),
    };
    setWorkflow(updated);
    void save(updated);
  }

  const topLevelSteps = (workflow?.actions ?? [])
    .filter((a) => !a.parentId)
    .sort((a, b) => a.rank - b.rank);

  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted-fg, #64748b)' }}>
        Loading…
      </div>
    );
  }

  if (error || !workflow) {
    return (
      <div style={{ padding: 24, color: '#dc2626' }}>
        {error ?? 'Workflow not found'}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', height: '100%', minHeight: '100vh' }}>
      {/* Canvas */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '24px',
          paddingRight: selectedStep ? 460 : 24,
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 28 }}>
          <h1 style={{ fontSize: 18, fontWeight: 600, margin: 0, flex: 1, minWidth: 0 }}>
            {workflow.name}
          </h1>
          {saving && (
            <span style={{ fontSize: 12, color: 'var(--muted-fg, #64748b)' }}>Saving…</span>
          )}
          <div
            role="switch"
            aria-checked={workflow.enabled}
            tabIndex={0}
            onClick={() => {
              const updated = { ...workflow, enabled: !workflow.enabled };
              setWorkflow(updated);
              void save(updated);
            }}
            onKeyDown={(e) => {
              if (e.key === ' ' || e.key === 'Enter') {
                const updated = { ...workflow, enabled: !workflow.enabled };
                setWorkflow(updated);
                void save(updated);
              }
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              cursor: 'pointer',
              fontSize: 13,
              color: 'var(--muted-fg, #64748b)',
            }}
          >
            <span
              style={{
                width: 36,
                height: 20,
                borderRadius: 10,
                background: workflow.enabled ? 'var(--accent, #6366f1)' : '#cbd5e1',
                position: 'relative',
                display: 'inline-block',
                transition: 'background 0.2s',
              }}
            >
              <span
                style={{
                  position: 'absolute',
                  top: 2,
                  left: workflow.enabled ? 18 : 2,
                  width: 16,
                  height: 16,
                  borderRadius: '50%',
                  background: '#fff',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                  transition: 'left 0.2s',
                }}
              />
            </span>
            {workflow.enabled ? 'Enabled' : 'Disabled'}
          </div>
        </div>

        {/* Workflow canvas */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            maxWidth: 480,
            margin: '0 auto',
          }}
        >
          {/* Trigger block */}
          <div
            onClick={() => setShowTriggerConfig(!showTriggerConfig)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') setShowTriggerConfig(!showTriggerConfig);
            }}
            style={{
              width: '100%',
              padding: '14px 16px',
              border: `2px solid ${showTriggerConfig ? 'var(--accent, #6366f1)' : 'var(--border, #e2e8f0)'}`,
              borderRadius: 10,
              background: showTriggerConfig
                ? 'var(--accent-muted, #ede9fe)'
                : 'var(--card-bg, #fff)',
              cursor: 'pointer',
              textAlign: 'left',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 20 }}>⚡</span>
              <div>
                <p style={{ margin: 0, fontSize: 11, color: 'var(--muted-fg, #64748b)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Trigger
                </p>
                <p style={{ margin: 0, fontSize: 14, fontWeight: 500 }}>
                  {TRIGGER_OPTIONS.find((t) => t.value === workflow.trigger.event)?.label ??
                    workflow.trigger.event}
                </p>
              </div>
            </div>
            {showTriggerConfig && (
              <div
                style={{ marginTop: 12 }}
                onClick={(e) => e.stopPropagation()}
              >
                <label
                  style={{
                    fontSize: 11,
                    fontWeight: 500,
                    color: 'var(--muted-fg, #64748b)',
                    display: 'block',
                    marginBottom: 4,
                  }}
                >
                  Trigger event
                </label>
                <select
                  value={workflow.trigger.event}
                  onChange={(e) => {
                    const updated = {
                      ...workflow,
                      trigger: { ...workflow.trigger, event: e.target.value as TriggerEvent },
                    };
                    setWorkflow(updated);
                    void save(updated);
                  }}
                  style={{
                    width: '100%',
                    padding: '7px 10px',
                    border: '1px solid var(--border, #e2e8f0)',
                    borderRadius: 6,
                    fontSize: 13,
                    background: 'var(--input-bg, #f8fafc)',
                    color: 'var(--foreground, #0f172a)',
                  }}
                >
                  {TRIGGER_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Add first step */}
          <AddStepButton onClick={() => setPickerPos({ afterId: null })} />

          {/* Steps */}
          {topLevelSteps.map((step) => (
            <React.Fragment key={step.id}>
              <StepRenderer
                step={step}
                allActions={workflow.actions}
                selected={selectedStep}
                onSelect={() => setSelectedStep(step)}
                onDelete={() => deleteStep(step.id)}
                onSelectChild={(s) => setSelectedStep(s)}
                onDeleteChild={(id) => deleteStep(id)}
              />
              <AddStepButton onClick={() => setPickerPos({ afterId: step.id })} />
            </React.Fragment>
          ))}

          {topLevelSteps.length === 0 && (
            <p style={{ fontSize: 13, color: 'var(--muted-fg, #64748b)', margin: '8px 0' }}>
              Click + to add your first step
            </p>
          )}
        </div>
      </div>

      {/* Config drawer */}
      {selectedStep && (
        <StepConfigDrawer
          step={selectedStep}
          fieldHints={fieldHints}
          onUpdate={(config) => updateStepConfig(selectedStep.id, config)}
          onClose={() => setSelectedStep(null)}
        />
      )}

      {/* Action picker modal */}
      {pickerPos && (
        <ActionPicker
          onSelect={(type) => addStep(type, pickerPos)}
          onClose={() => setPickerPos(null)}
        />
      )}
    </div>
  );
}
