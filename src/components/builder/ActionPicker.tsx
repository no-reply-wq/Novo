'use client';

import React from 'react';
import type { ActionType } from '@/platform/contracts/rules';

interface ActionGroup {
  label: string;
  actions: Array<{ type: ActionType; label: string; icon: string; desc: string }>;
}

const ACTION_GROUPS: ActionGroup[] = [
  {
    label: 'Data',
    actions: [
      { type: 'create_record', label: 'Create Record', icon: '➕', desc: 'Insert a new record' },
      { type: 'update_record', label: 'Update Record', icon: '✏️', desc: 'Modify an existing record' },
      { type: 'delete_record', label: 'Delete Record', icon: '🗑', desc: 'Remove a record' },
    ],
  },
  {
    label: 'Control',
    actions: [
      { type: 'if_else', label: 'If / Else', icon: '🔀', desc: 'Branch on condition' },
      { type: 'switch', label: 'Switch', icon: '⚡', desc: 'Multi-branch by value' },
      { type: 'for_each', label: 'For Each', icon: '🔁', desc: 'Loop over a list' },
      { type: 'try_catch', label: 'Try / Catch', icon: '🛡', desc: 'Handle errors' },
      { type: 'set_variable', label: 'Set Variable', icon: '📌', desc: 'Store a value' },
    ],
  },
  {
    label: 'Communication',
    actions: [
      { type: 'send_email', label: 'Send Email', icon: '📧', desc: 'Send an email' },
      { type: 'send_whatsapp', label: 'Send WhatsApp', icon: '💬', desc: 'Send a WhatsApp message' },
      { type: 'notify_user', label: 'Notify User', icon: '🔔', desc: 'In-app notification' },
    ],
  },
  {
    label: 'Documents',
    actions: [
      { type: 'generate_pdf', label: 'Generate PDF', icon: '📄', desc: 'Create a PDF document' },
    ],
  },
  {
    label: 'Integrations',
    actions: [
      { type: 'call_api', label: 'Call API', icon: '🌐', desc: 'HTTP request to external API' },
    ],
  },
  {
    label: 'Business',
    actions: [
      { type: 'post_stock', label: 'Post Stock', icon: '📦', desc: 'Record a stock movement' },
      { type: 'convert_to', label: 'Convert To', icon: '🔄', desc: 'Convert document type' },
      { type: 'start_approval', label: 'Start Approval', icon: '✅', desc: 'Trigger approval chain' },
    ],
  },
  {
    label: 'Misc',
    actions: [
      { type: 'wait_delay', label: 'Wait / Delay', icon: '⏱', desc: 'Pause execution' },
      { type: 'run_script', label: 'Run Script', icon: '⚙️', desc: 'Execute custom script' },
      { type: 'run_query', label: 'Run Query', icon: '🗄', desc: 'Execute a saved query' },
    ],
  },
];

interface ActionPickerProps {
  onSelect: (type: ActionType) => void;
  onClose: () => void;
}

export function ActionPicker({ onSelect, onClose }: ActionPickerProps) {
  return (
    <div
      role="dialog"
      aria-label="Pick an action"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0,0,0,0.4)',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          background: 'var(--card-bg, #fff)',
          borderRadius: 12,
          boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
          width: 'min(680px, 92vw)',
          maxHeight: '80vh',
          overflow: 'auto',
          padding: 24,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 20,
          }}
        >
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Add an action</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontSize: 18,
              color: 'var(--muted-fg, #64748b)',
              lineHeight: 1,
              padding: 4,
            }}
          >
            ×
          </button>
        </div>

        {ACTION_GROUPS.map((group) => (
          <div key={group.label} style={{ marginBottom: 20 }}>
            <p
              style={{
                margin: '0 0 8px',
                fontSize: 11,
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                color: 'var(--muted-fg, #64748b)',
              }}
            >
              {group.label}
            </p>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
                gap: 8,
              }}
            >
              {group.actions.map((action) => (
                <button
                  key={action.type}
                  onClick={() => onSelect(action.type)}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'flex-start',
                    gap: 4,
                    padding: '10px 12px',
                    border: '1px solid var(--border, #e2e8f0)',
                    borderRadius: 8,
                    background: 'var(--input-bg, #f8fafc)',
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'border-color 0.15s, background 0.15s',
                  }}
                  onMouseEnter={(e) => {
                    const btn = e.currentTarget as HTMLButtonElement;
                    btn.style.borderColor = 'var(--accent, #6366f1)';
                    btn.style.background = 'var(--accent-muted, #ede9fe)';
                  }}
                  onMouseLeave={(e) => {
                    const btn = e.currentTarget as HTMLButtonElement;
                    btn.style.borderColor = 'var(--border, #e2e8f0)';
                    btn.style.background = 'var(--input-bg, #f8fafc)';
                  }}
                >
                  <span style={{ fontSize: 18 }}>{action.icon}</span>
                  <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--foreground, #0f172a)' }}>
                    {action.label}
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--muted-fg, #64748b)' }}>
                    {action.desc}
                  </span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
