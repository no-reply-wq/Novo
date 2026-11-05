'use client';

import React, { useState, useEffect, useLayoutEffect, useCallback, useRef } from 'react';
import { useParams } from 'next/navigation';
import { ExpressionEditor, type FieldHint } from '@/components/builder/ExpressionEditor';

// ─── Types ────────────────────────────────────────────────────────────────────

type Permission = 'read' | 'create' | 'update' | 'delete';

interface RlsPolicy {
  roleId: string;
  expr: string;
}

interface TableRls {
  tableId: string;
  tableLabel: string;
  policies: Record<Permission, RlsPolicy[]>;
  fieldPermissions: Record<string, Record<string, 'read_write' | 'read_only' | 'hidden'>>;
}

interface Role {
  id: string;
  name: string;
}

const PERMISSIONS: Permission[] = ['read', 'create', 'update', 'delete'];
const FIELD_PERMS: Array<{ value: 'read_write' | 'read_only' | 'hidden'; label: string }> = [
  { value: 'read_write', label: 'Read & Write' },
  { value: 'read_only', label: 'Read only' },
  { value: 'hidden', label: 'Hidden' },
];

// ─── RLS policy row ───────────────────────────────────────────────────────────

interface PolicyRowProps {
  permission: Permission;
  policies: RlsPolicy[];
  roles: Role[];
  fieldHints: FieldHint[];
  onChange: (policies: RlsPolicy[]) => void;
}

function PolicyRow({ permission, policies, roles, fieldHints, onChange }: PolicyRowProps) {
  const policyMap: Record<string, string> = {};
  for (const p of policies) policyMap[p.roleId] = p.expr;

  return (
    <div
      style={{
        borderBottom: '1px solid var(--border, #e2e8f0)',
        padding: '10px 0',
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.07em',
          color: 'var(--muted-fg, #64748b)',
          marginBottom: 8,
        }}
      >
        {permission}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {roles.map((role) => (
          <div key={role.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
            <div
              style={{
                width: 100,
                fontSize: 12,
                fontWeight: 500,
                paddingTop: 10,
                flexShrink: 0,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
              title={role.name}
            >
              {role.name}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <ExpressionEditor
                value={policyMap[role.id] ?? ''}
                onChange={(v) => {
                  const updated = policies.filter((p) => p.roleId !== role.id);
                  if (v.trim()) updated.push({ roleId: role.id, expr: v });
                  onChange(updated);
                }}
                fieldHints={fieldHints}
                placeholder="true (allow all) or expression…"
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Field permissions matrix ─────────────────────────────────────────────────

interface FieldPermMatrixProps {
  tableRls: TableRls;
  roles: Role[];
  fields: Array<{ id: string; label: string }>;
  onChange: (fp: TableRls['fieldPermissions']) => void;
}

function FieldPermMatrix({ tableRls, roles, fields, onChange }: FieldPermMatrixProps) {
  const fp = tableRls.fieldPermissions;

  function setPerm(fieldId: string, roleId: string, perm: 'read_write' | 'read_only' | 'hidden') {
    const updated = {
      ...fp,
      [fieldId]: { ...(fp[fieldId] ?? {}), [roleId]: perm },
    };
    onChange(updated);
  }

  if (fields.length === 0) {
    return (
      <p style={{ fontSize: 13, color: 'var(--muted-fg, #64748b)', padding: '8px 0' }}>
        No fields found for this table.
      </p>
    );
  }

  return (
    <div style={{ overflowX: 'auto', marginTop: 16 }}>
      <table
        style={{
          borderCollapse: 'collapse',
          fontSize: 12,
          width: '100%',
          minWidth: 400,
        }}
      >
        <thead>
          <tr>
            <th
              style={{
                textAlign: 'left',
                padding: '6px 12px',
                fontWeight: 500,
                color: 'var(--muted-fg, #64748b)',
                borderBottom: '1px solid var(--border, #e2e8f0)',
                whiteSpace: 'nowrap',
              }}
            >
              Field
            </th>
            {roles.map((r) => (
              <th
                key={r.id}
                style={{
                  textAlign: 'center',
                  padding: '6px 10px',
                  fontWeight: 500,
                  color: 'var(--muted-fg, #64748b)',
                  borderBottom: '1px solid var(--border, #e2e8f0)',
                  whiteSpace: 'nowrap',
                }}
              >
                {r.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {fields.map((field) => (
            <tr
              key={field.id}
              style={{ borderBottom: '1px solid var(--border, #e2e8f0)' }}
            >
              <td
                style={{
                  padding: '8px 12px',
                  fontWeight: 500,
                  whiteSpace: 'nowrap',
                }}
              >
                {field.label}
              </td>
              {roles.map((role) => {
                const perm = fp[field.id]?.[role.id] ?? 'read_write';
                return (
                  <td key={role.id} style={{ padding: '6px 10px', textAlign: 'center' }}>
                    <select
                      value={perm}
                      onChange={(e) =>
                        setPerm(
                          field.id,
                          role.id,
                          e.target.value as 'read_write' | 'read_only' | 'hidden',
                        )
                      }
                      style={{
                        padding: '4px 6px',
                        border: '1px solid var(--border, #e2e8f0)',
                        borderRadius: 4,
                        fontSize: 11,
                        background: 'var(--input-bg, #f8fafc)',
                        color: 'var(--foreground, #0f172a)',
                      }}
                    >
                      {FIELD_PERMS.map((fp) => (
                        <option key={fp.value} value={fp.value}>
                          {fp.label}
                        </option>
                      ))}
                    </select>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function AccessPage() {
  const { appId } = useParams<{ appId: string }>();
  const [tables, setTables] = useState<TableRls[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fieldHints: FieldHint[] = [
    { apiKey: 'record', label: 'Record', type: 'object' },
    { apiKey: 'user', label: 'Current user', type: 'object' },
    { apiKey: 'user.id', label: 'User ID', type: 'text' },
    { apiKey: 'user.roles', label: 'User roles', type: 'array' },
  ];

  // Fake fields for demo (in real impl would fetch from API)
  const fields: Array<{ id: string; label: string }> = [
    { id: 'name', label: 'Name' },
    { id: 'amount', label: 'Amount' },
    { id: 'status', label: 'Status' },
    { id: 'created_at', label: 'Created at' },
  ];

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [rlsRes, rolesRes] = await Promise.all([
        fetch(`/api/builder/apps/${appId}/access`),
        fetch(`/api/builder/apps/${appId}/roles`),
      ]);
      if (rlsRes.ok) {
        const data = (await rlsRes.json()) as { tables: TableRls[] };
        setTables(data.tables);
        if (data.tables.length > 0 && !selectedTable) {
          setSelectedTable(data.tables[0].tableId);
        }
      }
      if (rolesRes.ok) {
        const data = (await rolesRes.json()) as { roles: Role[] };
        setRoles(data.roles);
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [appId, selectedTable]);

  const loadRef = useRef(load);
  useLayoutEffect(() => { loadRef.current = load; }, [load]);
  useEffect(() => {
    loadRef.current().catch((e: unknown) => setError(String(e)));
  }, [appId, selectedTable]);

  async function savePolicies(tableId: string, policies: TableRls['policies']) {
    setSaving(true);
    try {
      await fetch(`/api/builder/apps/${appId}/access`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tableId, policies }),
      });
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }

  const activeTable = tables.find((t) => t.tableId === selectedTable);

  function updatePolicy(tableId: string, perm: Permission, newPolicies: RlsPolicy[]) {
    setTables((ts) =>
      ts.map((t) =>
        t.tableId === tableId
          ? { ...t, policies: { ...t.policies, [perm]: newPolicies } }
          : t,
      ),
    );
    if (activeTable) {
      void savePolicies(tableId, { ...activeTable.policies, [perm]: newPolicies });
    }
  }

  return (
    <div style={{ display: 'flex', height: '100%', minHeight: '100vh' }}>
      {/* Table selector sidebar */}
      <div
        style={{
          width: 220,
          borderRight: '1px solid var(--border, #e2e8f0)',
          overflowY: 'auto',
          flexShrink: 0,
        }}
      >
        <div
          style={{
            padding: '14px 16px',
            borderBottom: '1px solid var(--border, #e2e8f0)',
            fontWeight: 600,
            fontSize: 13,
          }}
        >
          Tables
        </div>
        {loading && (
          <p style={{ fontSize: 12, color: 'var(--muted-fg, #64748b)', padding: '12px 16px' }}>
            Loading…
          </p>
        )}
        {tables.map((t) => (
          <button
            key={t.tableId}
            onClick={() => setSelectedTable(t.tableId)}
            style={{
              width: '100%',
              textAlign: 'left',
              padding: '10px 16px',
              border: 'none',
              background:
                selectedTable === t.tableId ? 'var(--accent-muted, #ede9fe)' : 'transparent',
              color:
                selectedTable === t.tableId
                  ? 'var(--accent, #6366f1)'
                  : 'var(--foreground, #0f172a)',
              fontWeight: selectedTable === t.tableId ? 500 : 400,
              fontSize: 13,
              cursor: 'pointer',
              borderLeft: selectedTable === t.tableId
                ? '2px solid var(--accent, #6366f1)'
                : '2px solid transparent',
            }}
          >
            {t.tableLabel}
          </button>
        ))}
      </div>

      {/* Policy editor */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 20,
          }}
        >
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>
              {activeTable ? `Access — ${activeTable.tableLabel}` : 'Access Control'}
            </h1>
            <p style={{ color: 'var(--muted-fg, #64748b)', fontSize: 13, margin: '4px 0 0' }}>
              Row-level security expressions evaluated per request.
            </p>
          </div>
          {saving && (
            <span style={{ fontSize: 12, color: 'var(--muted-fg, #64748b)' }}>Saving…</span>
          )}
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

        {!activeTable && !loading && (
          <div
            style={{
              textAlign: 'center',
              padding: 48,
              border: '1px dashed var(--border, #e2e8f0)',
              borderRadius: 8,
              color: 'var(--muted-fg, #64748b)',
            }}
          >
            <p style={{ margin: 0 }}>Select a table from the left to edit its access policies.</p>
          </div>
        )}

        {activeTable && (
          <>
            <div
              style={{
                border: '1px solid var(--border, #e2e8f0)',
                borderRadius: 8,
                padding: 16,
                background: 'var(--card-bg, #fff)',
                marginBottom: 20,
              }}
            >
              <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 600 }}>
                Row-level policies
              </h3>
              <p style={{ margin: '0 0 16px', fontSize: 12, color: 'var(--muted-fg, #64748b)' }}>
                Each expression must evaluate to <code>true</code> for access to be granted.
                Leave empty to allow all.
              </p>
              {PERMISSIONS.map((perm) => (
                <PolicyRow
                  key={perm}
                  permission={perm}
                  policies={activeTable.policies[perm] ?? []}
                  roles={roles}
                  fieldHints={fieldHints}
                  onChange={(p) => updatePolicy(activeTable.tableId, perm, p)}
                />
              ))}
            </div>

            <div
              style={{
                border: '1px solid var(--border, #e2e8f0)',
                borderRadius: 8,
                padding: 16,
                background: 'var(--card-bg, #fff)',
              }}
            >
              <h3 style={{ margin: '0 0 4px', fontSize: 14, fontWeight: 600 }}>
                Field-level permissions
              </h3>
              <p style={{ margin: 0, fontSize: 12, color: 'var(--muted-fg, #64748b)' }}>
                Control read/write access per field per role.
              </p>
              <FieldPermMatrix
                tableRls={activeTable}
                roles={roles}
                fields={fields}
                onChange={(fp) => {
                  setTables((ts) =>
                    ts.map((t) =>
                      t.tableId === activeTable.tableId ? { ...t, fieldPermissions: fp } : t,
                    ),
                  );
                }}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
