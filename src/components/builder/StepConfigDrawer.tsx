'use client';

import React from 'react';
import type { ActionDef, ActionType } from '@/platform/contracts/rules';
import { ExpressionEditor, type FieldHint } from './ExpressionEditor';

// ─── Types ────────────────────────────────────────────────────────────────────

interface StepConfigDrawerProps {
  step: ActionDef;
  fieldHints: FieldHint[];
  onUpdate: (config: Record<string, unknown>) => void;
  onClose: () => void;
}

type ConfigOf<T extends ActionType> = Record<string, unknown> & { _type?: T };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function Label({ children }: { children: React.ReactNode }) {
  return (
    <label
      style={{ fontSize: 12, fontWeight: 500, color: 'var(--muted-fg, #64748b)', display: 'block', marginBottom: 4 }}
    >
      {children}
    </label>
  );
}

function Field({ children }: { children: React.ReactNode }) {
  return <div style={{ marginBottom: 14 }}>{children}</div>;
}

function TextInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      style={{
        width: '100%',
        padding: '7px 10px',
        border: '1px solid var(--border, #e2e8f0)',
        borderRadius: 6,
        fontSize: 13,
        background: 'var(--input-bg, #f8fafc)',
        color: 'var(--foreground, #0f172a)',
        boxSizing: 'border-box',
      }}
    />
  );
}

function SelectInput({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{
        width: '100%',
        padding: '7px 10px',
        border: '1px solid var(--border, #e2e8f0)',
        borderRadius: 6,
        fontSize: 13,
        background: 'var(--input-bg, #f8fafc)',
        color: 'var(--foreground, #0f172a)',
        boxSizing: 'border-box',
      }}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

// ─── Per-type config panels ───────────────────────────────────────────────────

function CreateRecordConfig({
  config,
  fieldHints,
  onChange,
}: {
  config: Record<string, unknown>;
  fieldHints: FieldHint[];
  onChange: (c: Record<string, unknown>) => void;
}) {
  const tableId = (config.tableId as string) ?? '';
  const assignments = (config.assignments as Array<{ field: string; expr: string }>) ?? [];

  return (
    <>
      <Field>
        <Label>Table</Label>
        <TextInput
          value={tableId}
          onChange={(v) => onChange({ ...config, tableId: v })}
          placeholder="Table ID or expression…"
        />
      </Field>
      <Field>
        <Label>Field assignments</Label>
        {assignments.map((a, i) => (
          <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
            <input
              value={a.field}
              onChange={(e) => {
                const next = assignments.map((x, j) =>
                  i === j ? { ...x, field: e.target.value } : x,
                );
                onChange({ ...config, assignments: next });
              }}
              placeholder="Field key"
              style={{
                width: 120,
                padding: '6px 8px',
                border: '1px solid var(--border, #e2e8f0)',
                borderRadius: 6,
                fontSize: 12,
                background: 'var(--input-bg, #f8fafc)',
                color: 'var(--foreground, #0f172a)',
                flexShrink: 0,
              }}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <ExpressionEditor
                value={a.expr}
                onChange={(v) => {
                  const next = assignments.map((x, j) => (i === j ? { ...x, expr: v } : x));
                  onChange({ ...config, assignments: next });
                }}
                fieldHints={fieldHints}
                placeholder="value expression…"
              />
            </div>
            <button
              onClick={() => {
                const next = assignments.filter((_, j) => j !== i);
                onChange({ ...config, assignments: next });
              }}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--muted-fg, #64748b)',
                fontSize: 16,
                padding: '0 4px',
                flexShrink: 0,
              }}
            >
              ×
            </button>
          </div>
        ))}
        <button
          onClick={() =>
            onChange({ ...config, assignments: [...assignments, { field: '', expr: '' }] })
          }
          style={{
            background: 'none',
            border: '1px dashed var(--border, #e2e8f0)',
            borderRadius: 6,
            padding: '5px 10px',
            fontSize: 12,
            cursor: 'pointer',
            color: 'var(--muted-fg, #64748b)',
          }}
        >
          + Add field
        </button>
      </Field>
    </>
  );
}

function IfElseConfig({
  config,
  fieldHints,
  onChange,
}: {
  config: Record<string, unknown>;
  fieldHints: FieldHint[];
  onChange: (c: Record<string, unknown>) => void;
}) {
  return (
    <Field>
      <Label>Condition expression</Label>
      <ExpressionEditor
        value={(config.conditionExpr as string) ?? ''}
        onChange={(v) => onChange({ ...config, conditionExpr: v })}
        fieldHints={fieldHints}
        placeholder="e.g. record.amount > 10000"
      />
      <p style={{ margin: '8px 0 0', fontSize: 11, color: 'var(--muted-fg, #64748b)' }}>
        Steps inside the Then / Else branches are configured on the canvas.
      </p>
    </Field>
  );
}

function ForEachConfig({
  config,
  fieldHints,
  onChange,
}: {
  config: Record<string, unknown>;
  fieldHints: FieldHint[];
  onChange: (c: Record<string, unknown>) => void;
}) {
  return (
    <>
      <Field>
        <Label>Source expression (array)</Label>
        <ExpressionEditor
          value={(config.sourceExpr as string) ?? ''}
          onChange={(v) => onChange({ ...config, sourceExpr: v })}
          fieldHints={fieldHints}
          placeholder="e.g. record.lineItems"
        />
      </Field>
      <Field>
        <Label>Item variable name</Label>
        <TextInput
          value={(config.itemVar as string) ?? 'item'}
          onChange={(v) => onChange({ ...config, itemVar: v })}
          placeholder="item"
        />
      </Field>
    </>
  );
}

function SendEmailConfig({
  config,
  fieldHints,
  onChange,
}: {
  config: Record<string, unknown>;
  fieldHints: FieldHint[];
  onChange: (c: Record<string, unknown>) => void;
}) {
  return (
    <>
      <Field>
        <Label>To (expression)</Label>
        <ExpressionEditor
          value={(config.toExpr as string) ?? ''}
          onChange={(v) => onChange({ ...config, toExpr: v })}
          fieldHints={fieldHints}
          placeholder="e.g. record.email"
        />
      </Field>
      <Field>
        <Label>Subject</Label>
        <TextInput
          value={(config.subject as string) ?? ''}
          onChange={(v) => onChange({ ...config, subject: v })}
          placeholder="Email subject…"
        />
      </Field>
      <Field>
        <Label>Template ID</Label>
        <TextInput
          value={(config.templateId as string) ?? ''}
          onChange={(v) => onChange({ ...config, templateId: v })}
          placeholder="Template ID…"
        />
      </Field>
    </>
  );
}

function SendWhatsAppConfig({
  config,
  fieldHints,
  onChange,
}: {
  config: Record<string, unknown>;
  fieldHints: FieldHint[];
  onChange: (c: Record<string, unknown>) => void;
}) {
  return (
    <>
      <Field>
        <Label>To (expression)</Label>
        <ExpressionEditor
          value={(config.toExpr as string) ?? ''}
          onChange={(v) => onChange({ ...config, toExpr: v })}
          fieldHints={fieldHints}
          placeholder="e.g. record.phone"
        />
      </Field>
      <Field>
        <Label>Template ID</Label>
        <TextInput
          value={(config.templateId as string) ?? ''}
          onChange={(v) => onChange({ ...config, templateId: v })}
          placeholder="WhatsApp template ID…"
        />
      </Field>
    </>
  );
}

function CallApiConfig({
  config,
  onChange,
}: {
  config: Record<string, unknown>;
  onChange: (c: Record<string, unknown>) => void;
}) {
  return (
    <>
      <Field>
        <Label>Method</Label>
        <SelectInput
          value={(config.method as string) ?? 'POST'}
          onChange={(v) => onChange({ ...config, method: v })}
          options={['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map((m) => ({ value: m, label: m }))}
        />
      </Field>
      <Field>
        <Label>URL</Label>
        <TextInput
          value={(config.url as string) ?? ''}
          onChange={(v) => onChange({ ...config, url: v })}
          placeholder="https://…"
        />
      </Field>
      <Field>
        <Label>Body (JSON expression)</Label>
        <TextInput
          value={(config.bodyExpr as string) ?? ''}
          onChange={(v) => onChange({ ...config, bodyExpr: v })}
          placeholder="JSON or expression…"
        />
      </Field>
    </>
  );
}

function WaitDelayConfig({
  config,
  onChange,
}: {
  config: Record<string, unknown>;
  onChange: (c: Record<string, unknown>) => void;
}) {
  return (
    <Field>
      <Label>Delay (seconds)</Label>
      <TextInput
        value={String((config.seconds as number) ?? 0)}
        onChange={(v) => onChange({ ...config, seconds: Number(v) || 0 })}
        placeholder="60"
      />
    </Field>
  );
}

function RunScriptConfig({
  config,
  onChange,
}: {
  config: Record<string, unknown>;
  onChange: (c: Record<string, unknown>) => void;
}) {
  return (
    <Field>
      <Label>Script ID</Label>
      <TextInput
        value={(config.scriptId as string) ?? ''}
        onChange={(v) => onChange({ ...config, scriptId: v })}
        placeholder="Script ID…"
      />
    </Field>
  );
}

function DefaultConfig({
  step,
  onChange,
}: {
  step: ActionDef;
  onChange: (c: Record<string, unknown>) => void;
}) {
  return (
    <p style={{ fontSize: 13, color: 'var(--muted-fg, #64748b)' }}>
      No configuration panel for <strong>{step.actionType}</strong> yet.
    </p>
  );
}

// ─── Main drawer ──────────────────────────────────────────────────────────────

export function StepConfigDrawer({ step, fieldHints, onUpdate, onClose }: StepConfigDrawerProps) {
  const [config, setConfig] = React.useState<Record<string, unknown>>(step.config);

  function handleChange(c: Record<string, unknown>) {
    setConfig(c);
    onUpdate(c);
  }

  const title = step.label ?? step.actionType.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

  function renderConfig() {
    const props = { config, fieldHints, onChange: handleChange };
    switch (step.actionType) {
      case 'create_record':
        return <CreateRecordConfig {...props} />;
      case 'update_record':
        return <CreateRecordConfig {...props} />;
      case 'if_else':
        return <IfElseConfig {...props} />;
      case 'for_each':
        return <ForEachConfig {...props} />;
      case 'send_email':
        return <SendEmailConfig {...props} />;
      case 'send_whatsapp':
        return <SendWhatsAppConfig {...props} />;
      case 'call_api':
        return <CallApiConfig config={config} onChange={handleChange} />;
      case 'wait_delay':
        return <WaitDelayConfig config={config} onChange={handleChange} />;
      case 'run_script':
        return <RunScriptConfig config={config} onChange={handleChange} />;
      default:
        return <DefaultConfig step={step} onChange={handleChange} />;
    }
  }

  return (
    <div
      role="complementary"
      aria-label="Step configuration"
      style={{
        position: 'fixed',
        top: 0,
        right: 0,
        bottom: 0,
        width: 420,
        background: 'var(--card-bg, #fff)',
        borderLeft: '1px solid var(--border, #e2e8f0)',
        boxShadow: '-4px 0 20px rgba(0,0,0,0.08)',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 50,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '16px 20px',
          borderBottom: '1px solid var(--border, #e2e8f0)',
        }}
      >
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>{title}</h3>
        <button
          onClick={onClose}
          aria-label="Close drawer"
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontSize: 18,
            color: 'var(--muted-fg, #64748b)',
            padding: 4,
            lineHeight: 1,
          }}
        >
          ×
        </button>
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: 20 }}>{renderConfig()}</div>
    </div>
  );
}
