'use client';

import React, { useState, useEffect, useLayoutEffect, useCallback, useRef } from 'react';
import { useParams } from 'next/navigation';
import type { ApprovalChainDef, ApprovalLevel } from '@/platform/contracts/rules';
import { ExpressionEditor, type FieldHint } from '@/components/builder/ExpressionEditor';

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

function FieldRow({ children }: { children: React.ReactNode }) {
  return <div style={{ marginBottom: 12 }}>{children}</div>;
}

function TextInput({
  value,
  onChange,
  placeholder,
  type = 'text',
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <input
      type={type}
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

// ─── Level editor ─────────────────────────────────────────────────────────────

interface LevelEditorProps {
  level: ApprovalLevel;
  fieldHints: FieldHint[];
  onChange: (l: ApprovalLevel) => void;
  onDelete: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
}

function LevelEditor({
  level,
  fieldHints,
  onChange,
  onDelete,
  onMoveUp,
  onMoveDown,
}: LevelEditorProps) {
  return (
    <div
      style={{
        border: '1px solid var(--border, #e2e8f0)',
        borderRadius: 8,
        padding: 14,
        background: 'var(--card-bg, #fff)',
        marginBottom: 10,
      }}
    >
      {/* Level header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <div
          style={{
            width: 24,
            height: 24,
            borderRadius: '50%',
            background: 'var(--accent, #6366f1)',
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 11,
            fontWeight: 600,
            flexShrink: 0,
          }}
        >
          {level.rank}
        </div>
        <input
          value={`Level ${level.rank}`}
          readOnly
          style={{
            flex: 1,
            padding: '5px 8px',
            border: '1px solid var(--border, #e2e8f0)',
            borderRadius: 6,
            fontSize: 13,
            background: 'var(--input-bg, #f8fafc)',
            color: 'var(--foreground, #0f172a)',
          }}
        />
        <div style={{ display: 'flex', gap: 4 }}>
          {onMoveUp && (
            <button
              onClick={onMoveUp}
              title="Move up"
              style={{
                background: 'none',
                border: '1px solid var(--border, #e2e8f0)',
                borderRadius: 4,
                cursor: 'pointer',
                padding: '2px 6px',
                fontSize: 12,
                color: 'var(--muted-fg, #64748b)',
              }}
            >
              ↑
            </button>
          )}
          {onMoveDown && (
            <button
              onClick={onMoveDown}
              title="Move down"
              style={{
                background: 'none',
                border: '1px solid var(--border, #e2e8f0)',
                borderRadius: 4,
                cursor: 'pointer',
                padding: '2px 6px',
                fontSize: 12,
                color: 'var(--muted-fg, #64748b)',
              }}
            >
              ↓
            </button>
          )}
          <button
            onClick={onDelete}
            title="Remove level"
            style={{
              background: 'none',
              border: '1px solid #fecaca',
              borderRadius: 4,
              cursor: 'pointer',
              padding: '2px 6px',
              fontSize: 12,
              color: '#dc2626',
            }}
          >
            ×
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        {/* Approver type */}
        <FieldRow>
          <Label>Approver type</Label>
          <select
            value={level.approverType}
            onChange={(e) =>
              onChange({ ...level, approverType: e.target.value as ApprovalLevel['approverType'] })
            }
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
            <option value="role">Role</option>
            <option value="user">Specific User</option>
            <option value="expr">Expression</option>
          </select>
        </FieldRow>

        {/* Mode */}
        <FieldRow>
          <Label>Mode</Label>
          <select
            value={level.mode}
            onChange={(e) =>
              onChange({ ...level, mode: e.target.value as ApprovalLevel['mode'] })
            }
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
            <option value="sequential">Sequential</option>
            <option value="parallel">Parallel</option>
          </select>
        </FieldRow>
      </div>

      {/* Approver value */}
      <FieldRow>
        <Label>
          {level.approverType === 'role'
            ? 'Role ID'
            : level.approverType === 'user'
              ? 'User ID'
              : 'Expression (returns user ID)'}
        </Label>
        {level.approverType === 'expr' ? (
          <ExpressionEditor
            value={level.approverExpr ?? ''}
            onChange={(v) => onChange({ ...level, approverExpr: v })}
            fieldHints={fieldHints}
            placeholder="expression returning user ID…"
          />
        ) : (
          <TextInput
            value={
              level.approverType === 'role'
                ? (level.roleId ?? '')
                : (level.userId ?? '')
            }
            onChange={(v) =>
              onChange(
                level.approverType === 'role'
                  ? { ...level, roleId: v }
                  : { ...level, userId: v },
              )
            }
            placeholder={level.approverType === 'role' ? 'Role ID…' : 'User ID…'}
          />
        )}
      </FieldRow>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
        {/* Escalate after */}
        <FieldRow>
          <Label>Escalate after (hrs)</Label>
          <input
            type="number"
            value={level.escalateAfterHours ?? ''}
            onChange={(e) =>
              onChange({ ...level, escalateAfterHours: Number(e.target.value) || undefined })
            }
            placeholder="—"
            min={0}
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
        </FieldRow>

        {/* Amount min */}
        <FieldRow>
          <Label>Amount min</Label>
          <input
            type="number"
            value={level.amountMin ?? ''}
            onChange={(e) =>
              onChange({ ...level, amountMin: Number(e.target.value) || undefined })
            }
            placeholder="—"
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
        </FieldRow>

        {/* Amount max */}
        <FieldRow>
          <Label>Amount max</Label>
          <input
            type="number"
            value={level.amountMax ?? ''}
            onChange={(e) =>
              onChange({ ...level, amountMax: Number(e.target.value) || undefined })
            }
            placeholder="—"
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
        </FieldRow>
      </div>
    </div>
  );
}

// ─── Chain editor ─────────────────────────────────────────────────────────────

interface ChainEditorProps {
  chain: ApprovalChainDef;
  fieldHints: FieldHint[];
  onSave: (c: ApprovalChainDef) => void;
  onClose: () => void;
}

function ChainEditor({ chain: initial, fieldHints, onSave, onClose }: ChainEditorProps) {
  const [chain, setChain] = useState<ApprovalChainDef>(initial);

  function addLevel() {
    const rank = chain.levels.length + 1;
    const level: ApprovalLevel = {
      rank,
      approverType: 'role',
      mode: 'sequential',
    };
    setChain({ ...chain, levels: [...chain.levels, level] });
  }

  function updateLevel(i: number, l: ApprovalLevel) {
    setChain({ ...chain, levels: chain.levels.map((x, j) => (i === j ? l : x)) });
  }

  function deleteLevel(i: number) {
    setChain({
      ...chain,
      levels: chain.levels
        .filter((_, j) => j !== i)
        .map((l, j) => ({ ...l, rank: j + 1 })),
    });
  }

  function moveLevel(i: number, dir: -1 | 1) {
    const newLevels = [...chain.levels];
    const j = i + dir;
    if (j < 0 || j >= newLevels.length) return;
    [newLevels[i], newLevels[j]] = [newLevels[j], newLevels[i]];
    setChain({ ...chain, levels: newLevels.map((l, k) => ({ ...l, rank: k + 1 })) });
  }

  return (
    <div
      style={{
        border: '1px solid var(--border, #e2e8f0)',
        borderRadius: 10,
        background: 'var(--card-bg, #fff)',
        marginBottom: 16,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '14px 16px',
          borderBottom: '1px solid var(--border, #e2e8f0)',
        }}
      >
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>
          {chain.id === 'new' ? 'New chain' : 'Edit chain'}
        </h3>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={onClose}
            style={{
              padding: '6px 12px',
              border: '1px solid var(--border, #e2e8f0)',
              borderRadius: 6,
              background: 'transparent',
              cursor: 'pointer',
              fontSize: 13,
            }}
          >
            Cancel
          </button>
          <button
            onClick={() => onSave(chain)}
            style={{
              padding: '6px 12px',
              border: 'none',
              borderRadius: 6,
              background: 'var(--accent, #6366f1)',
              color: '#fff',
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: 500,
            }}
          >
            Save chain
          </button>
        </div>
      </div>

      <div style={{ padding: 16 }}>
        <FieldRow>
          <Label>Chain name</Label>
          <TextInput
            value={chain.name}
            onChange={(v) => setChain({ ...chain, name: v })}
            placeholder="e.g. Purchase Order Approval"
          />
        </FieldRow>

        <FieldRow>
          <Label>Table ID</Label>
          <TextInput
            value={chain.tableId}
            onChange={(v) => setChain({ ...chain, tableId: v })}
            placeholder="Table ID…"
          />
        </FieldRow>

        <div style={{ marginTop: 20, marginBottom: 10 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 10,
            }}
          >
            <h4 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>Approval levels</h4>
            <button
              onClick={addLevel}
              style={{
                padding: '5px 10px',
                border: '1px dashed var(--border, #e2e8f0)',
                borderRadius: 6,
                background: 'transparent',
                cursor: 'pointer',
                fontSize: 12,
                color: 'var(--muted-fg, #64748b)',
              }}
            >
              + Add level
            </button>
          </div>

          {chain.levels.length === 0 && (
            <p style={{ fontSize: 13, color: 'var(--muted-fg, #64748b)', textAlign: 'center', padding: '20px 0' }}>
              No levels yet. Click &ldquo;Add level&rdquo; to start.
            </p>
          )}

          {chain.levels.map((level, i) => (
            <LevelEditor
              key={i}
              level={level}
              fieldHints={fieldHints}
              onChange={(l) => updateLevel(i, l)}
              onDelete={() => deleteLevel(i)}
              onMoveUp={i > 0 ? () => moveLevel(i, -1) : undefined}
              onMoveDown={i < chain.levels.length - 1 ? () => moveLevel(i, 1) : undefined}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ApprovalsPage() {
  const { appId } = useParams<{ appId: string }>();
  const [chains, setChains] = useState<ApprovalChainDef[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingChain, setEditingChain] = useState<ApprovalChainDef | null>(null);

  const fieldHints: FieldHint[] = [
    { apiKey: 'record', label: 'Record', type: 'object' },
    { apiKey: 'user', label: 'User', type: 'object' },
    { apiKey: 'amount', label: 'Amount', type: 'number' },
  ];

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/builder/apps/${appId}/approvals`);
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as { chains: ApprovalChainDef[] };
      setChains(data.chains);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [appId]);

  const loadRef = useRef(load);
  useLayoutEffect(() => { loadRef.current = load; }, [load]);
  useEffect(() => {
    loadRef.current().catch((e: unknown) => setError(String(e)));
  }, [appId]);

  async function saveChain(chain: ApprovalChainDef) {
    const isNew = chain.id === 'new';
    const url = isNew
      ? `/api/builder/apps/${appId}/approvals`
      : `/api/builder/apps/${appId}/approvals/${chain.id}`;
    const res = await fetch(url, {
      method: isNew ? 'POST' : 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(chain),
    });
    if (!res.ok) {
      setError(await res.text());
      return;
    }
    setEditingChain(null);
    void load();
  }

  function newChain(): ApprovalChainDef {
    return {
      id: 'new',
      appId,
      name: '',
      tableId: '',
      levels: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  return (
    <div style={{ padding: '24px', maxWidth: 800, margin: '0 auto' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 24,
        }}
      >
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>Approval Chains</h1>
          <p style={{ color: 'var(--muted-fg, #64748b)', fontSize: 13, margin: '4px 0 0' }}>
            Define multi-level approval workflows for records.
          </p>
        </div>
        <button
          onClick={() => setEditingChain(newChain())}
          style={{
            padding: '8px 14px',
            background: 'var(--accent, #6366f1)',
            color: '#fff',
            border: 'none',
            borderRadius: 6,
            fontWeight: 500,
            fontSize: 13,
            cursor: 'pointer',
          }}
        >
          + New Chain
        </button>
      </div>

      {error && (
        <div
          style={{
            padding: '10px 14px',
            background: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: 6,
            color: '#dc2626',
            fontSize: 13,
            marginBottom: 16,
          }}
        >
          {error}
        </div>
      )}

      {/* Editor for new/editing chain */}
      {editingChain && (
        <ChainEditor
          chain={editingChain}
          fieldHints={fieldHints}
          onSave={saveChain}
          onClose={() => setEditingChain(null)}
        />
      )}

      {loading && (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted-fg, #64748b)' }}>
          Loading…
        </div>
      )}

      {!loading && chains.length === 0 && !editingChain && (
        <div
          style={{
            textAlign: 'center',
            padding: 48,
            border: '1px dashed var(--border, #e2e8f0)',
            borderRadius: 8,
            color: 'var(--muted-fg, #64748b)',
          }}
        >
          <div style={{ width: 48, height: 48, marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f0fdf4', borderRadius: 12 }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
              <polyline points="22 4 12 14.01 9 11.01"/>
            </svg>
          </div>
          <p style={{ margin: 0, fontWeight: 500 }}>No approval chains yet</p>
          <p style={{ margin: '4px 0 0', fontSize: 13 }}>
            Create a chain to add multi-level approval to your tables.
          </p>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {chains.map((chain) => (
          <div
            key={chain.id}
            style={{
              border: '1px solid var(--border, #e2e8f0)',
              borderRadius: 8,
              padding: '14px 16px',
              background: 'var(--card-bg, #fff)',
              display: 'flex',
              alignItems: 'center',
              gap: 12,
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ margin: 0, fontWeight: 500, fontSize: 14 }}>{chain.name}</p>
              <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--muted-fg, #64748b)' }}>
                {chain.levels.length} level{chain.levels.length !== 1 ? 's' : ''}
                {chain.tableId ? ` · Table: ${chain.tableId}` : ''}
              </p>
            </div>
            <button
              onClick={() => setEditingChain(chain)}
              style={{
                padding: '5px 10px',
                border: '1px solid var(--border, #e2e8f0)',
                borderRadius: 6,
                background: 'transparent',
                cursor: 'pointer',
                fontSize: 12,
                color: 'var(--muted-fg, #64748b)',
              }}
            >
              Edit
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
