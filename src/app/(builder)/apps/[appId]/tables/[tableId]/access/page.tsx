'use client';

/**
 * Builder: Table Access Control page
 *
 * Three sections:
 *   1. Per-role access rules — row-level expressions
 *   2. Field permission matrix — roles × fields grid
 *   3. Per-user overrides — explicit grants/restrictions
 */

import * as React from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { useToast } from '@/components/ui/toast';
import type { TableAccessRule, FieldPermission, UserPermissionOverride, FieldPermissionLevel } from '@/platform/access/types';

// ─── Types ────────────────────────────────────────────────────────────────────

interface RoleDef { id: string; name: string }
interface FieldDef { id: string; label: string }

type Tab = 'rules' | 'fields' | 'users';

const OPERATIONS = ['select', 'insert', 'update', 'delete', 'all'] as const;
type Operation = typeof OPERATIONS[number];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function qs(params: Record<string, string>): string {
  return '?' + new URLSearchParams(params).toString();
}

// ─── Access Rules Tab ─────────────────────────────────────────────────────────

function AccessRulesTab({
  appId,
  tableId,
  tenant,
  roles,
}: {
  appId: string;
  tableId: string;
  tenant: string;
  roles: RoleDef[];
}) {
  const toast = useToast();
  const [rules, setRules] = React.useState<TableAccessRule[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [adding, setAdding] = React.useState(false);
  const [form, setForm] = React.useState<{
    roleId: string;
    operation: Operation;
    condition: string;
    priority: number;
  }>({ roleId: roles[0]?.id ?? '', operation: 'select', condition: '', priority: 0 });

  React.useEffect(() => {
    setLoading(true);
    fetch(`/api/builder/apps/${appId}/tables/${tableId}/access-rules${qs({ tenant })}`)
      .then((r) => r.json())
      .then((data: { rules: TableAccessRule[] }) => {
        setRules(data.rules ?? []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [appId, tableId, tenant]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setAdding(true);
    try {
      const res = await fetch(
        `/api/builder/apps/${appId}/tables/${tableId}/access-rules${qs({ tenant })}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
        },
      );
      const data: { rule?: TableAccessRule; error?: string } = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed');
      setRules((prev) => {
        // Replace if same role+op exists
        const idx = prev.findIndex((r) => r.roleId === data.rule!.roleId && r.operation === data.rule!.operation);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = data.rule!;
          return next;
        }
        return [...prev, data.rule!];
      });
      setForm((f) => ({ ...f, condition: '' }));
      toast.success('Rule saved');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save rule');
    } finally {
      setAdding(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      await fetch(
        `/api/builder/apps/${appId}/tables/${tableId}/access-rules${qs({ tenant, id })}`,
        { method: 'DELETE' },
      );
      setRules((prev) => prev.filter((r) => r.id !== id));
      toast.success('Rule deleted');
    } catch {
      toast.error('Failed to delete rule');
    }
  }

  if (loading) return <div className="flex justify-center py-12"><Spinner /></div>;

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Row-level access rules</h3>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Expressions control which records each role can see or modify.
          Use <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">record.owner_id == user.id</code>,{' '}
          <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">record.location_id in user.locations</code>, etc.
        </p>
      </div>

      {/* Existing rules */}
      {rules.length > 0 && (
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-800">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Role</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Operation</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Condition</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Priority</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {rules.map((rule) => (
                <tr key={rule.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                  <td className="px-4 py-2 font-mono text-xs">{rule.roleId}</td>
                  <td className="px-4 py-2">
                    <span className={cn(
                      'inline-flex items-center px-2 py-0.5 rounded text-xs font-medium',
                      rule.operation === 'select' && 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
                      rule.operation === 'insert' && 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
                      rule.operation === 'update' && 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300',
                      rule.operation === 'delete' && 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
                      rule.operation === 'all' && 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
                    )}>
                      {rule.operation}
                    </span>
                  </td>
                  <td className="px-4 py-2 font-mono text-xs text-gray-600 dark:text-gray-300 max-w-xs truncate" title={rule.condition}>
                    {rule.condition || <span className="italic text-gray-400">always true</span>}
                  </td>
                  <td className="px-4 py-2 text-xs text-gray-500">{rule.priority}</td>
                  <td className="px-4 py-2 text-right">
                    <button
                      onClick={() => handleDelete(rule.id)}
                      className="text-xs text-red-500 hover:text-red-700"
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add rule form */}
      <form onSubmit={handleAdd} className="rounded-lg border border-gray-200 dark:border-gray-700 p-4 space-y-3">
        <h4 className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide">Add rule</h4>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Role</label>
            <select
              className="w-full text-sm border border-gray-300 dark:border-gray-600 rounded px-2 py-1.5 bg-white dark:bg-gray-900"
              value={form.roleId}
              onChange={(e) => setForm((f) => ({ ...f, roleId: e.target.value }))}
            >
              <option value="__all__">All roles</option>
              {roles.map((r) => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Operation</label>
            <select
              className="w-full text-sm border border-gray-300 dark:border-gray-600 rounded px-2 py-1.5 bg-white dark:bg-gray-900"
              value={form.operation}
              onChange={(e) => setForm((f) => ({ ...f, operation: e.target.value as Operation }))}
            >
              {OPERATIONS.map((op) => <option key={op} value={op}>{op}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Priority</label>
            <input
              type="number"
              className="w-full text-sm border border-gray-300 dark:border-gray-600 rounded px-2 py-1.5 bg-white dark:bg-gray-900"
              value={form.priority}
              min={0}
              onChange={(e) => setForm((f) => ({ ...f, priority: parseInt(e.target.value, 10) || 0 }))}
            />
          </div>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Condition expression</label>
          <input
            type="text"
            className="w-full text-sm border border-gray-300 dark:border-gray-600 rounded px-3 py-1.5 font-mono bg-white dark:bg-gray-900"
            placeholder="record.owner_id == user.id"
            value={form.condition}
            onChange={(e) => setForm((f) => ({ ...f, condition: e.target.value }))}
          />
          <p className="mt-1 text-xs text-gray-400">Leave empty to allow all rows for this role+operation.</p>
        </div>
        <Button type="submit" size="sm" disabled={adding}>
          {adding ? 'Saving…' : 'Add rule'}
        </Button>
      </form>
    </div>
  );
}

// ─── Field Permission Matrix Tab ──────────────────────────────────────────────

const PERM_LEVELS: FieldPermissionLevel[] = ['editable', 'read_only', 'hidden'];
const PERM_LABELS: Record<FieldPermissionLevel, string> = {
  editable: 'Edit',
  read_only: 'Read',
  hidden: 'Hide',
};
const PERM_COLORS: Record<FieldPermissionLevel, string> = {
  editable: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  read_only: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300',
  hidden: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400',
};

function FieldPermissionsTab({
  appId,
  tableId,
  tenant,
  roles,
  fields,
}: {
  appId: string;
  tableId: string;
  tenant: string;
  roles: RoleDef[];
  fields: FieldDef[];
}) {
  const toast = useToast();
  // Map: `${fieldId}:${roleId}` → permission
  const [matrix, setMatrix] = React.useState<Record<string, FieldPermissionLevel>>({});
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState<string | null>(null);

  React.useEffect(() => {
    setLoading(true);
    fetch(`/api/builder/apps/${appId}/tables/${tableId}/field-permissions${qs({ tenant })}`)
      .then((r) => r.json())
      .then((data: { permissions: FieldPermission[] }) => {
        const m: Record<string, FieldPermissionLevel> = {};
        for (const p of data.permissions ?? []) {
          m[`${p.fieldId}:${p.roleId}`] = p.permission;
        }
        setMatrix(m);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [appId, tableId, tenant]);

  async function setPermission(fieldId: string, roleId: string, permission: FieldPermissionLevel) {
    const key = `${fieldId}:${roleId}`;
    setSaving(key);
    try {
      const res = await fetch(
        `/api/builder/apps/${appId}/tables/${tableId}/field-permissions${qs({ tenant })}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fieldId, roleId, permission }),
        },
      );
      if (!res.ok) {
        const data: { error?: string } = await res.json();
        throw new Error(data.error ?? 'Failed');
      }
      setMatrix((prev) => ({ ...prev, [key]: permission }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed');
    } finally {
      setSaving(null);
    }
  }

  if (loading) return <div className="flex justify-center py-12"><Spinner /></div>;

  if (fields.length === 0) {
    return <p className="text-sm text-gray-500 py-8 text-center">No fields defined for this table.</p>;
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Field permission matrix</h3>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Click to cycle: <span className="font-medium text-green-600">Editable</span> → <span className="font-medium text-yellow-600">Read-only</span> → <span className="font-medium text-gray-500">Hidden</span>
        </p>
      </div>
      <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
        <table className="text-sm">
          <thead className="bg-gray-50 dark:bg-gray-800">
            <tr>
              <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase sticky left-0 bg-gray-50 dark:bg-gray-800 z-10 min-w-[140px]">
                Field
              </th>
              {roles.map((role) => (
                <th key={role.id} className="px-4 py-2.5 text-center text-xs font-medium text-gray-500 uppercase min-w-[100px]">
                  {role.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
            {fields.map((field) => (
              <tr key={field.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                <td className="px-4 py-2 text-xs font-medium text-gray-700 dark:text-gray-300 sticky left-0 bg-white dark:bg-gray-900">
                  {field.label}
                </td>
                {roles.map((role) => {
                  const key = `${field.id}:${role.id}`;
                  const current: FieldPermissionLevel = matrix[key] ?? 'editable';
                  const isSaving = saving === key;

                  function cycle() {
                    const idx = PERM_LEVELS.indexOf(current);
                    const next = PERM_LEVELS[(idx + 1) % PERM_LEVELS.length];
                    void setPermission(field.id, role.id, next);
                  }

                  return (
                    <td key={role.id} className="px-4 py-2 text-center">
                      <button
                        onClick={cycle}
                        disabled={isSaving}
                        className={cn(
                          'inline-flex items-center px-2 py-0.5 rounded text-xs font-medium transition-opacity',
                          PERM_COLORS[current],
                          isSaving && 'opacity-50 cursor-not-allowed',
                        )}
                        title={`Click to change ${field.label} for ${role.name}`}
                      >
                        {isSaving ? '…' : PERM_LABELS[current]}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── User Overrides Tab ───────────────────────────────────────────────────────

function UserOverridesTab({
  appId,
  tableId,
  tenant,
  fields,
}: {
  appId: string;
  tableId: string;
  tenant: string;
  fields: FieldDef[];
}) {
  const toast = useToast();
  const [userId, setUserId] = React.useState('');
  const [currentOverride, setCurrentOverride] = React.useState<UserPermissionOverride | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [localOverride, setLocalOverride] = React.useState<UserPermissionOverride['overrides']>({});

  async function loadOverride() {
    if (!userId.trim()) return;
    setLoading(true);
    try {
      const res = await fetch(
        `/api/builder/apps/${appId}/users/${encodeURIComponent(userId)}/permission-overrides${qs({ tenant, tableId })}`,
      );
      const data: { overrides: UserPermissionOverride[] } = await res.json();
      const existing = data.overrides?.[0] ?? null;
      setCurrentOverride(existing);
      setLocalOverride(existing?.overrides ?? {});
    } catch {
      toast.error('Failed to load overrides');
    } finally {
      setLoading(false);
    }
  }

  async function saveOverride() {
    if (!userId.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(
        `/api/builder/apps/${appId}/users/${encodeURIComponent(userId)}/permission-overrides${qs({ tenant, tableId })}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(localOverride),
        },
      );
      if (!res.ok) {
        const d: { error?: string } = await res.json();
        throw new Error(d.error ?? 'Failed');
      }
      toast.success('User overrides saved');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed');
    } finally {
      setSaving(false);
    }
  }

  function setFieldOverride(fieldId: string, level: FieldPermissionLevel | 'default') {
    setLocalOverride((prev) => {
      const fieldOverrides = { ...(prev.fieldOverrides ?? {}) };
      if (level === 'default') {
        delete fieldOverrides[fieldId];
      } else {
        fieldOverrides[fieldId] = level;
      }
      return { ...prev, fieldOverrides };
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Per-user permission overrides</h3>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Override role defaults for a specific user. These take precedence over all role-based rules.
        </p>
      </div>

      {/* User lookup */}
      <div className="flex gap-2">
        <input
          type="text"
          className="flex-1 text-sm border border-gray-300 dark:border-gray-600 rounded px-3 py-1.5 bg-white dark:bg-gray-900"
          placeholder="User ID"
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') void loadOverride(); }}
        />
        <Button size="sm" onClick={loadOverride} disabled={loading || !userId.trim()}>
          {loading ? 'Loading…' : 'Load'}
        </Button>
      </div>

      {currentOverride !== null && (
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-4 space-y-5">
          {/* CRUD toggles */}
          <div className="grid grid-cols-3 gap-4">
            {(['canCreate', 'canEdit', 'canDelete'] as const).map((perm) => {
              const labels: Record<string, string> = { canCreate: 'Can create', canEdit: 'Can edit', canDelete: 'Can delete' };
              const val = localOverride[perm];
              return (
                <label key={perm} className="flex items-center gap-2 text-sm cursor-pointer">
                  <select
                    className="text-xs border border-gray-300 dark:border-gray-600 rounded px-1.5 py-1 bg-white dark:bg-gray-900"
                    value={val === undefined ? 'inherit' : String(val)}
                    onChange={(e) => {
                      const v = e.target.value;
                      setLocalOverride((prev) => ({
                        ...prev,
                        [perm]: v === 'inherit' ? undefined : v === 'true',
                      }));
                    }}
                  >
                    <option value="inherit">Inherit from role</option>
                    <option value="true">Allow</option>
                    <option value="false">Deny</option>
                  </select>
                  <span className="text-gray-600 dark:text-gray-300">{labels[perm]}</span>
                </label>
              );
            })}
          </div>

          {/* Row filter */}
          <div>
            <label className="block text-xs text-gray-500 mb-1">Additional row filter (AND-ed with role rules)</label>
            <input
              type="text"
              className="w-full text-sm border border-gray-300 dark:border-gray-600 rounded px-3 py-1.5 font-mono bg-white dark:bg-gray-900"
              placeholder="record.region == 'north'"
              value={localOverride.rowFilter ?? ''}
              onChange={(e) => setLocalOverride((prev) => ({ ...prev, rowFilter: e.target.value || undefined }))}
            />
          </div>

          {/* Field overrides */}
          {fields.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">Field overrides</label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {fields.map((field) => {
                  const val = localOverride.fieldOverrides?.[field.id] ?? 'default';
                  return (
                    <label key={field.id} className="flex items-center gap-2 text-xs">
                      <select
                        className="text-xs border border-gray-300 dark:border-gray-600 rounded px-1 py-0.5 bg-white dark:bg-gray-900"
                        value={val}
                        onChange={(e) => setFieldOverride(field.id, e.target.value as FieldPermissionLevel | 'default')}
                      >
                        <option value="default">Default</option>
                        <option value="editable">Editable</option>
                        <option value="read_only">Read only</option>
                        <option value="hidden">Hidden</option>
                      </select>
                      <span className="text-gray-600 dark:text-gray-300 truncate">{field.label}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          <Button size="sm" onClick={saveOverride} disabled={saving}>
            {saving ? 'Saving…' : 'Save overrides'}
          </Button>
        </div>
      )}

      {currentOverride === null && userId && !loading && (
        <div className="rounded-lg border border-dashed border-gray-200 dark:border-gray-700 p-6 text-center">
          <p className="text-sm text-gray-500">No overrides found for this user.</p>
          <Button
            size="sm"
            variant="ghost"
            className="mt-2"
            onClick={() => {
              setCurrentOverride({ id: '', userId, tableId, overrides: {} });
              setLocalOverride({});
            }}
          >
            Create override
          </Button>
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

function TableAccessPageInner() {
  const rawParams = useParams();
  const appId = typeof rawParams.appId === 'string' ? rawParams.appId : (rawParams.appId?.[0] ?? '');
  const tableId = typeof rawParams.tableId === 'string' ? rawParams.tableId : (rawParams.tableId?.[0] ?? '');
  const searchParams = useSearchParams();
  const tenant = searchParams.get('tenant') ?? '';

  const [tab, setTab] = React.useState<Tab>('rules');
  const [roles, setRoles] = React.useState<RoleDef[]>([]);
  const [fields, setFields] = React.useState<FieldDef[]>([]);
  const [bootstrapLoading, setBootstrapLoading] = React.useState(true);

  React.useEffect(() => {
    if (!tenant) return;
    // Load roles and fields in parallel
    Promise.all([
      fetch(`/api/builder/apps/${appId}/roles${qs({ tenant })}`).then((r) => r.json()).catch(() => ({ roles: [] })),
      fetch(`/api/builder/apps/${appId}/tables/${tableId}${qs({ tenant })}`).then((r) => r.json()).catch(() => ({ fields: [] })),
    ]).then(([rolesData, tableData]: [{ roles?: RoleDef[] }, { fields?: FieldDef[] }]) => {
      setRoles(rolesData.roles ?? []);
      setFields(
        (tableData.fields ?? []).map((f: { id: string; label?: string; apiKey?: string }) => ({
          id: f.id,
          label: f.label ?? f.apiKey ?? f.id,
        })),
      );
      setBootstrapLoading(false);
    });
  }, [appId, tableId, tenant]);

  if (!tenant) {
    return (
      <div className="p-8 text-sm text-gray-500">
        Missing tenant parameter. Please navigate here from the builder.
      </div>
    );
  }

  if (bootstrapLoading) {
    return <div className="flex justify-center py-16"><Spinner /></div>;
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: 'rules', label: 'Row-level rules' },
    { id: 'fields', label: 'Field permissions' },
    { id: 'users', label: 'User overrides' },
  ];

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Access control</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
          Configure row-level security, field visibility, and per-user exceptions.
        </p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 border-b border-gray-200 dark:border-gray-700">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              'px-4 py-2 text-sm font-medium transition-colors',
              tab === t.id
                ? 'border-b-2 border-blue-600 text-blue-600'
                : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'rules' && (
        <AccessRulesTab appId={appId} tableId={tableId} tenant={tenant} roles={roles} />
      )}
      {tab === 'fields' && (
        <FieldPermissionsTab appId={appId} tableId={tableId} tenant={tenant} roles={roles} fields={fields} />
      )}
      {tab === 'users' && (
        <UserOverridesTab appId={appId} tableId={tableId} tenant={tenant} fields={fields} />
      )}
    </div>
  );
}

export default function TableAccessPage() {
  return (
    <React.Suspense fallback={<div className="flex items-center justify-center h-64"><Spinner /></div>}>
      <TableAccessPageInner />
    </React.Suspense>
  );
}
