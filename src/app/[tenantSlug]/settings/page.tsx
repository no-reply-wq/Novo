'use client';

import { useState, useEffect } from 'react';
import { PageHeader } from '@/components/layout/TenantLayout';
import { Button, Badge, Modal, Input, Select, Card, Toast } from '@/components/ui';
import { Plus, Edit, UserX, UserCheck, Key, Shield, Users } from 'lucide-react';
import { formatDate } from '@/lib/utils';
import { useParams } from 'next/navigation';

interface User {
  id: string;
  name: string;
  email: string;
  role_id: string;
  role_name: string;
  active: boolean;
  created_at: string;
  last_login: string;
}

interface Role {
  id: string;
  name: string;
  description: string;
}

type Tab = 'users' | 'roles';

// All modules + actions for the permission matrix
const MODULES = [
  { key: 'leads', label: 'CRM / Leads', actions: ['view', 'create', 'edit', 'delete'] },
  { key: 'quotations', label: 'Quotations', actions: ['view', 'create', 'edit', 'delete'] },
  { key: 'sales', label: 'Sales Orders', actions: ['view', 'create', 'edit', 'delete'] },
  { key: 'purchase', label: 'Purchase Orders', actions: ['view', 'create', 'edit', 'delete'] },
  { key: 'inventory', label: 'Inventory', actions: ['view', 'create', 'edit'] },
  { key: 'expenses', label: 'Expenses', actions: ['view', 'create', 'approve'] },
  { key: 'form_builder', label: 'Form Builder', actions: ['view', 'edit', 'delete'] },
  { key: 'settings', label: 'Settings', actions: ['view', 'manage_users', 'manage_roles'] },
];

export default function SettingsPage() {
  const { tenantSlug } = useParams<{ tenantSlug: string }>();
  const [tab, setTab] = useState<Tab>('users');
  const [users, setUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [permsByRole, setPermsByRole] = useState<Record<string, Array<{ module: string; action: string; granted: boolean }>>>({});
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const [userModal, setUserModal] = useState(false);
  const [editUser, setEditUser] = useState<User | null>(null);
  const [roleModal, setRoleModal] = useState(false);
  const [permModal, setPermModal] = useState<Role | null>(null);
  const [permDraft, setPermDraft] = useState<Set<string>>(new Set());

  const [userDraft, setUserDraft] = useState({ name: '', email: '', password: '', roleId: '' });
  const [roleDraft, setRoleDraft] = useState({ name: '', description: '' });
  const [saving, setSaving] = useState(false);

  async function loadAll() {
    setLoading(true);
    const [usersData, rolesData] = await Promise.all([
      fetch(`/api/tenant/users?tenant=${tenantSlug}`).then(r => r.json()),
      fetch(`/api/tenant/roles?tenant=${tenantSlug}`).then(r => r.json()),
    ]);
    setUsers(usersData.users ?? []);
    setRoles(rolesData.roles ?? []);
    setPermsByRole(rolesData.permsByRole ?? {});
    setLoading(false);
  }

  useEffect(() => { loadAll(); }, []);

  async function saveUser() {
    setSaving(true);
    try {
      if (editUser) {
        await fetch(`/api/tenant/users?tenant=${tenantSlug}&id=${editUser.id}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: userDraft.name, email: userDraft.email, roleId: userDraft.roleId || undefined, password: userDraft.password || undefined }),
        });
        setToast({ message: 'User updated', type: 'success' });
      } else {
        const res = await fetch(`/api/tenant/users?tenant=${tenantSlug}`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(userDraft),
        });
        if (!res.ok) {
          const err = await res.json();
          setToast({ message: err.error ?? 'Failed to create user', type: 'error' });
          return;
        }
        setToast({ message: 'User created', type: 'success' });
      }
      setUserModal(false);
      setEditUser(null);
      loadAll();
    } finally {
      setSaving(false);
    }
  }

  async function toggleUserActive(user: User) {
    await fetch(`/api/tenant/users?tenant=${tenantSlug}&id=${user.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: !user.active }),
    });
    setToast({ message: user.active ? 'User deactivated' : 'User reactivated', type: 'success' });
    loadAll();
  }

  async function saveRole() {
    setSaving(true);
    try {
      await fetch(`/api/tenant/roles?tenant=${tenantSlug}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(roleDraft),
      });
      setRoleModal(false);
      setToast({ message: 'Role created', type: 'success' });
      loadAll();
    } finally {
      setSaving(false);
    }
  }

  async function savePermissions(role: Role) {
    setSaving(true);
    try {
      const permissions = [...permDraft].map(key => {
        const [module, action] = key.split(':');
        return { module, action, granted: true };
      });
      await fetch(`/api/tenant/roles?tenant=${tenantSlug}&roleId=${role.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ permissions }),
      });
      setPermModal(null);
      setToast({ message: 'Permissions saved', type: 'success' });
      loadAll();
    } finally {
      setSaving(false);
    }
  }

  function openPermModal(role: Role) {
    const existing = new Set<string>(
      (permsByRole[role.id] ?? [])
        .filter(p => p.granted)
        .map(p => `${p.module}:${p.action}`)
    );
    setPermDraft(existing);
    setPermModal(role);
  }

  function togglePerm(module: string, action: string) {
    const key = `${module}:${action}`;
    setPermDraft(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  return (
    <>
      <PageHeader title="Settings" description="Manage users, roles, and permissions" />

      <div className="p-6 space-y-6">
        {/* Tab nav */}
        <div className="flex gap-1 bg-slate-100 rounded-lg p-1 w-fit">
          {[{ v: 'users' as Tab, label: 'Users', icon: <Users className="w-4 h-4" /> },
            { v: 'roles' as Tab, label: 'Roles & Permissions', icon: <Shield className="w-4 h-4" /> }
          ].map(({ v, label, icon }) => (
            <button key={v} onClick={() => setTab(v)}
              className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm transition-all ${tab === v ? 'bg-white shadow-sm text-slate-900 font-medium' : 'text-slate-500 hover:text-slate-700'}`}>
              {icon}{label}
            </button>
          ))}
        </div>

        {/* Users tab */}
        {tab === 'users' && (
          <Card padding={false}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <h2 className="font-semibold text-slate-900">Users ({users.length})</h2>
              <Button size="sm" icon={<Plus className="w-3.5 h-3.5" />} onClick={() => {
                setEditUser(null);
                setUserDraft({ name: '', email: '', password: '', roleId: roles[0]?.id ?? '' });
                setUserModal(true);
              }}>
                Invite user
              </Button>
            </div>
            {loading ? <p className="p-6 text-slate-400">Loading…</p> : (
              <div className="divide-y divide-slate-100">
                {users.map(u => (
                  <div key={u.id} className="flex items-center gap-4 px-5 py-4">
                    <div className="w-9 h-9 rounded-full bg-indigo-100 flex items-center justify-center text-sm font-semibold text-indigo-700 flex-shrink-0">
                      {u.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800 flex items-center gap-2">
                        {u.name}
                        {!u.active && <Badge variant="warning">Deactivated</Badge>}
                      </p>
                      <p className="text-xs text-slate-400">{u.email} · {u.role_name}</p>
                    </div>
                    {u.last_login && (
                      <p className="text-xs text-slate-400 hidden md:block">Last login {formatDate(u.last_login)}</p>
                    )}
                    <div className="flex gap-2">
                      <Button size="sm" variant="ghost" icon={<Edit className="w-3.5 h-3.5" />}
                        onClick={() => {
                          setEditUser(u);
                          setUserDraft({ name: u.name, email: u.email, password: '', roleId: u.role_id });
                          setUserModal(true);
                        }}>
                        Edit
                      </Button>
                      <Button size="sm" variant="ghost"
                        icon={u.active ? <UserX className="w-3.5 h-3.5" /> : <UserCheck className="w-3.5 h-3.5" />}
                        onClick={() => toggleUserActive(u)}>
                        {u.active ? 'Deactivate' : 'Reactivate'}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        )}

        {/* Roles tab */}
        {tab === 'roles' && (
          <div className="space-y-4">
            <div className="flex justify-end">
              <Button size="sm" icon={<Plus className="w-3.5 h-3.5" />} onClick={() => {
                setRoleDraft({ name: '', description: '' });
                setRoleModal(true);
              }}>
                New role
              </Button>
            </div>
            {loading ? <p className="text-slate-400">Loading…</p> : (
              <div className="grid grid-cols-3 gap-4">
                {roles.map(role => (
                  <Card key={role.id}>
                    <div className="flex items-start justify-between mb-3">
                      <div className="w-9 h-9 bg-slate-100 rounded-xl flex items-center justify-center">
                        <Shield className="w-4 h-4 text-slate-500" />
                      </div>
                    </div>
                    <h3 className="font-semibold text-slate-900 mb-1">{role.name}</h3>
                    {role.description && <p className="text-xs text-slate-500 mb-3">{role.description}</p>}
                    <div className="text-xs text-slate-400 mb-3">
                      {(permsByRole[role.id] ?? []).filter(p => p.granted).length} permissions granted
                    </div>
                    <Button size="sm" variant="secondary" icon={<Key className="w-3.5 h-3.5" />}
                      onClick={() => openPermModal(role)} className="w-full">
                      Edit permissions
                    </Button>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* User modal */}
      <Modal open={userModal} onClose={() => setUserModal(false)}
        title={editUser ? 'Edit user' : 'Invite user'} size="md">
        <div className="space-y-4">
          <Input label="Name" value={userDraft.name} onChange={e => setUserDraft({ ...userDraft, name: e.target.value })} required />
          <Input label="Email" type="email" value={userDraft.email} onChange={e => setUserDraft({ ...userDraft, email: e.target.value })} required />
          <Select label="Role" value={userDraft.roleId} onChange={e => setUserDraft({ ...userDraft, roleId: e.target.value })}
            options={roles.map(r => ({ value: r.id, label: r.name }))} required />
          <Input label={editUser ? 'New password (leave blank to keep)' : 'Password (min 8 chars)'}
            type="password" value={userDraft.password}
            onChange={e => setUserDraft({ ...userDraft, password: e.target.value })}
            required={!editUser} />
          <div className="flex gap-3 justify-end">
            <Button variant="secondary" onClick={() => setUserModal(false)}>Cancel</Button>
            <Button loading={saving} onClick={saveUser}>{editUser ? 'Save changes' : 'Create user'}</Button>
          </div>
        </div>
      </Modal>

      {/* Role modal */}
      <Modal open={roleModal} onClose={() => setRoleModal(false)} title="New role" size="sm">
        <div className="space-y-4">
          <Input label="Role name" value={roleDraft.name} onChange={e => setRoleDraft({ ...roleDraft, name: e.target.value })} required />
          <Input label="Description" value={roleDraft.description} onChange={e => setRoleDraft({ ...roleDraft, description: e.target.value })} />
          <div className="flex gap-3 justify-end">
            <Button variant="secondary" onClick={() => setRoleModal(false)}>Cancel</Button>
            <Button loading={saving} onClick={saveRole}>Create role</Button>
          </div>
        </div>
      </Modal>

      {/* Permissions modal */}
      <Modal open={!!permModal} onClose={() => setPermModal(null)}
        title={`Permissions — ${permModal?.name}`} size="lg">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="text-left py-2 pr-4 text-xs font-medium text-slate-500 w-48">Module</th>
                {['view', 'create', 'edit', 'delete', 'approve', 'manage_users', 'manage_roles'].map(a => (
                  <th key={a} className="py-2 px-2 text-xs font-medium text-slate-500 text-center">{a}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {MODULES.map(mod => (
                <tr key={mod.key}>
                  <td className="py-3 pr-4 font-medium text-slate-700">{mod.label}</td>
                  {['view', 'create', 'edit', 'delete', 'approve', 'manage_users', 'manage_roles'].map(action => (
                    <td key={action} className="py-3 px-2 text-center">
                      {mod.actions.includes(action) ? (
                        <input type="checkbox"
                          checked={permDraft.has(`${mod.key}:${action}`)}
                          onChange={() => togglePerm(mod.key, action)}
                          className="w-4 h-4 rounded border-slate-300 text-indigo-600 cursor-pointer" />
                      ) : (
                        <span className="text-slate-200">—</span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex gap-3 justify-end mt-6">
          <Button variant="secondary" onClick={() => setPermModal(null)}>Cancel</Button>
          <Button loading={saving} onClick={() => permModal && savePermissions(permModal)}>Save permissions</Button>
        </div>
      </Modal>

      {toast && <Toast message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />}
    </>
  );
}
