'use client';

/**
 * /builder/settings/users
 * Workspace-level user management — list all tenant users, invite new ones,
 * change roles, and deactivate/reactivate. Distinct from the per-app members
 * page (apps/[appId]/members) which handles app-specific access.
 */

import React, { useState, useEffect, useCallback } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface WorkspaceUser {
  id: string;
  name: string;
  email: string;
  active: boolean;
  last_login: string | null;
  created_at: string;
  role_id: string | null;
  role_name: string | null;
}

interface Role {
  id: string;
  name: string;
  is_system: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function initials(name: string): string {
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

function formatDate(iso: string | null): string {
  if (!iso) return 'Never';
  return new Date(iso).toLocaleDateString(undefined, { dateStyle: 'medium' });
}

const ROLE_COLORS: Record<string, string> = {
  admin: '#7c3aed',
  editor: '#2563eb',
  viewer: '#6b7280',
};

function roleBadgeColor(roleName: string | null): string {
  if (!roleName) return '#9ca3af';
  const lower = roleName.toLowerCase();
  for (const [key, color] of Object.entries(ROLE_COLORS)) {
    if (lower.includes(key)) return color;
  }
  return '#6366f1';
}

const AVATAR_COLORS = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#ec4899'];

// ─── Styles ───────────────────────────────────────────────────────────────────

const S = {
  page: {
    maxWidth: 860,
    margin: '0 auto',
    padding: '32px 16px',
    fontFamily: 'Inter, system-ui, sans-serif',
    color: 'var(--fg, #111)',
  } as React.CSSProperties,

  header: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 28,
    gap: 16,
    flexWrap: 'wrap' as const,
  } as React.CSSProperties,

  heading: { fontSize: 22, fontWeight: 700, margin: 0 } as React.CSSProperties,
  subheading: { fontSize: 13, color: 'var(--fg-muted, #6b7280)', marginTop: 4 } as React.CSSProperties,

  primaryBtn: {
    padding: '9px 18px',
    border: 'none',
    borderRadius: 7,
    background: '#6366f1',
    color: '#fff',
    cursor: 'pointer',
    fontSize: 14,
    fontWeight: 500,
    flexShrink: 0,
  } as React.CSSProperties,

  card: {
    border: '1px solid var(--border, #e5e7eb)',
    borderRadius: 10,
    background: 'var(--surface, #fff)',
    overflow: 'hidden',
  } as React.CSSProperties,

  row: {
    display: 'flex',
    alignItems: 'center',
    padding: '13px 16px',
    borderBottom: '1px solid var(--border, #e5e7eb)',
    gap: 12,
  } as React.CSSProperties,

  avatar: (name: string): React.CSSProperties => ({
    width: 36,
    height: 36,
    borderRadius: '50%',
    background: AVATAR_COLORS[name.charCodeAt(0) % AVATAR_COLORS.length],
    color: '#fff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 700,
    fontSize: 13,
    flexShrink: 0,
  }),

  nameBlock: { flex: 1, minWidth: 0 } as React.CSSProperties,
  name: { fontWeight: 500, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const } as React.CSSProperties,
  email: { fontSize: 12, color: 'var(--fg-muted, #6b7280)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const } as React.CSSProperties,

  badge: (color: string): React.CSSProperties => ({
    display: 'inline-flex',
    alignItems: 'center',
    padding: '2px 9px',
    borderRadius: 99,
    fontSize: 11,
    fontWeight: 600,
    background: color + '22',
    color,
    flexShrink: 0,
  }),

  select: {
    padding: '5px 8px',
    border: '1px solid var(--border, #e5e7eb)',
    borderRadius: 5,
    fontSize: 12,
    background: 'var(--surface, #fff)',
    color: 'var(--fg, #111)',
    cursor: 'pointer',
  } as React.CSSProperties,

  actionBtn: (danger?: boolean): React.CSSProperties => ({
    padding: '5px 10px',
    border: '1px solid var(--border, #e5e7eb)',
    borderRadius: 5,
    background: danger ? '#fef2f2' : 'transparent',
    color: danger ? '#dc2626' : 'var(--fg, #111)',
    cursor: 'pointer',
    fontSize: 12,
    fontWeight: 500,
    flexShrink: 0,
  }),

  emptyState: {
    padding: '36px 16px',
    textAlign: 'center' as const,
    color: 'var(--fg-muted, #6b7280)',
    fontSize: 13,
  } as React.CSSProperties,

  error: {
    padding: '10px 14px',
    background: '#fef2f2',
    border: '1px solid #fecaca',
    borderRadius: 7,
    color: '#dc2626',
    fontSize: 13,
    marginBottom: 16,
  } as React.CSSProperties,

  success: {
    padding: '10px 14px',
    background: '#f0fdf4',
    border: '1px solid #bbf7d0',
    borderRadius: 7,
    color: '#16a34a',
    fontSize: 13,
    marginBottom: 16,
  } as React.CSSProperties,

  // Modal
  overlay: {
    position: 'fixed' as const,
    inset: 0,
    background: 'rgba(0,0,0,0.4)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 999,
  } as React.CSSProperties,

  modal: {
    background: 'var(--surface, #fff)',
    borderRadius: 12,
    padding: 24,
    width: 440,
    maxWidth: '95vw',
    boxShadow: '0 20px 60px rgba(0,0,0,0.18)',
  } as React.CSSProperties,

  modalTitle: { fontSize: 17, fontWeight: 700, marginBottom: 20 } as React.CSSProperties,

  field: { marginBottom: 14 } as React.CSSProperties,

  label: {
    display: 'block',
    fontSize: 11,
    fontWeight: 600,
    marginBottom: 5,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.06em',
    color: 'var(--fg-muted, #6b7280)',
  } as React.CSSProperties,

  input: {
    width: '100%',
    padding: '9px 12px',
    border: '1px solid var(--border, #e5e7eb)',
    borderRadius: 7,
    fontSize: 14,
    color: 'var(--fg, #111)',
    background: 'var(--surface, #fff)',
    boxSizing: 'border-box' as const,
  } as React.CSSProperties,

  modalSelect: {
    width: '100%',
    padding: '9px 12px',
    border: '1px solid var(--border, #e5e7eb)',
    borderRadius: 7,
    fontSize: 14,
    color: 'var(--fg, #111)',
    background: 'var(--surface, #fff)',
    boxSizing: 'border-box' as const,
  } as React.CSSProperties,

  modalActions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 22,
  } as React.CSSProperties,

  cancelBtn: {
    padding: '9px 18px',
    border: '1px solid var(--border, #e5e7eb)',
    borderRadius: 7,
    background: 'transparent',
    cursor: 'pointer',
    fontSize: 14,
  } as React.CSSProperties,

  note: {
    fontSize: 12,
    color: 'var(--fg-muted, #6b7280)',
    marginTop: 8,
    padding: '8px 10px',
    background: 'var(--bg-muted, #f9fafb)',
    borderRadius: 5,
  } as React.CSSProperties,
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function WorkspaceUsersPage() {
  const [tenantSlug, setTenantSlug] = useState('');
  const [users, setUsers] = useState<WorkspaceUser[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);

  // Invite form state
  const [inviteName, setInviteName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [invitePassword, setInvitePassword] = useState('');
  const [inviteRoleId, setInviteRoleId] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  // Resolve tenant from session
  useEffect(() => {
    fetch('/api/auth/session')
      .then((r) => r.json())
      .then((s: { user?: { tenantSlug?: string } }) => {
        if (s?.user?.tenantSlug) setTenantSlug(s.user.tenantSlug);
      })
      .catch(() => undefined);
  }, []);

  const load = useCallback(async () => {
    if (!tenantSlug) return;
    setLoading(true);
    setError(null);
    try {
      const [usersRes, rolesRes] = await Promise.all([
        fetch(`/api/tenant/users?tenant=${encodeURIComponent(tenantSlug)}`),
        fetch(`/api/tenant/roles?tenant=${encodeURIComponent(tenantSlug)}`),
      ]);
      if (usersRes.ok) {
        const data = (await usersRes.json()) as { users: WorkspaceUser[] };
        setUsers(data.users);
      }
      if (rolesRes.ok) {
        const data = (await rolesRes.json()) as { roles: Role[] };
        setRoles(data.roles);
        if (data.roles.length > 0 && !inviteRoleId) {
          setInviteRoleId(data.roles[0].id);
        }
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [tenantSlug, inviteRoleId]);

  useEffect(() => {
    if (tenantSlug) {
      load().catch((e: unknown) => setError(String(e)));
    }
  }, [tenantSlug, load]);

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    setSendError(null);
    setSending(true);
    try {
      const res = await fetch(`/api/tenant/users?tenant=${encodeURIComponent(tenantSlug)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: inviteName, email: inviteEmail, password: invitePassword, roleId: inviteRoleId }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setSendError(data.error ?? 'Failed to create user');
        return;
      }
      setShowModal(false);
      setInviteName('');
      setInviteEmail('');
      setInvitePassword('');
      setSuccess('User created. Share their email and temporary password so they can log in.');
      await load();
    } catch (err) {
      setSendError(String(err));
    } finally {
      setSending(false);
    }
  }

  async function changeRole(userId: string, roleId: string) {
    setError(null);
    try {
      const res = await fetch(`/api/tenant/users?tenant=${encodeURIComponent(tenantSlug)}&id=${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roleId }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        setError(data.error ?? 'Failed to update role');
        return;
      }
      setUsers((prev) => prev.map((u) => {
        if (u.id !== userId) return u;
        const role = roles.find((r) => r.id === roleId);
        return { ...u, role_id: roleId, role_name: role?.name ?? u.role_name };
      }));
    } catch (err) {
      setError(String(err));
    }
  }

  async function toggleActive(userId: string, active: boolean) {
    setError(null);
    try {
      const res = await fetch(`/api/tenant/users?tenant=${encodeURIComponent(tenantSlug)}&id=${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        setError(data.error ?? 'Failed to update user');
        return;
      }
      setUsers((prev) => prev.map((u) => u.id === userId ? { ...u, active } : u));
    } catch (err) {
      setError(String(err));
    }
  }

  const activeUsers = users.filter((u) => u.active);
  const inactiveUsers = users.filter((u) => !u.active);

  return (
    <div style={S.page}>
      {/* Header */}
      <div style={S.header}>
        <div>
          <h1 style={S.heading}>Workspace Users</h1>
          <p style={S.subheading}>
            Manage who has access to this workspace and their roles.
            {activeUsers.length > 0 && ` ${activeUsers.length} active user${activeUsers.length !== 1 ? 's' : ''}.`}
          </p>
        </div>
        <button style={S.primaryBtn} onClick={() => { setShowModal(true); setSendError(null); }}>
          + Add User
        </button>
      </div>

      {error && <div style={S.error}>{error}</div>}
      {success && (
        <div style={S.success}>
          {success}
          <button
            onClick={() => setSuccess(null)}
            style={{ marginLeft: 12, background: 'none', border: 'none', cursor: 'pointer', color: '#16a34a', fontSize: 13 }}
          >
            x
          </button>
        </div>
      )}

      {/* Active users */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--fg-muted, #6b7280)', marginBottom: 10 }}>
          Active ({activeUsers.length})
        </div>
        <div style={S.card}>
          {loading && <div style={S.emptyState}>Loading…</div>}
          {!loading && activeUsers.length === 0 && (
            <div style={S.emptyState}>No active users. Add someone to get started.</div>
          )}
          {activeUsers.map((user, i) => (
            <div
              key={user.id}
              style={{ ...S.row, borderBottom: i < activeUsers.length - 1 ? S.row.borderBottom : 'none' }}
            >
              <div style={S.avatar(user.name)}>{initials(user.name)}</div>
              <div style={S.nameBlock}>
                <div style={S.name}>{user.name}</div>
                <div style={S.email}>{user.email}</div>
              </div>
              {/* Role selector */}
              <select
                style={S.select}
                value={user.role_id ?? ''}
                onChange={(e) => changeRole(user.id, e.target.value)}
                aria-label="Change role"
              >
                {!user.role_id && <option value="">No role</option>}
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
              {user.role_name && (
                <span style={S.badge(roleBadgeColor(user.role_name))}>{user.role_name}</span>
              )}
              <span style={{ fontSize: 11, color: 'var(--fg-muted, #6b7280)', flexShrink: 0, minWidth: 90 }}>
                {formatDate(user.last_login)}
              </span>
              <button
                style={S.actionBtn(true)}
                onClick={() => toggleActive(user.id, false)}
                title="Deactivate user"
              >
                Deactivate
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Inactive users */}
      {inactiveUsers.length > 0 && (
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--fg-muted, #6b7280)', marginBottom: 10 }}>
            Inactive ({inactiveUsers.length})
          </div>
          <div style={S.card}>
            {inactiveUsers.map((user, i) => (
              <div
                key={user.id}
                style={{ ...S.row, borderBottom: i < inactiveUsers.length - 1 ? S.row.borderBottom : 'none', opacity: 0.6 }}
              >
                <div style={{ ...S.avatar(user.name), filter: 'grayscale(1)' }}>{initials(user.name)}</div>
                <div style={S.nameBlock}>
                  <div style={S.name}>{user.name}</div>
                  <div style={S.email}>{user.email}</div>
                </div>
                {user.role_name && (
                  <span style={S.badge('#9ca3af')}>{user.role_name}</span>
                )}
                <span style={S.badge('#9ca3af')}>Inactive</span>
                <button
                  style={S.actionBtn()}
                  onClick={() => toggleActive(user.id, true)}
                >
                  Reactivate
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add user modal */}
      {showModal && (
        <div style={S.overlay} onClick={() => setShowModal(false)}>
          <div style={S.modal} onClick={(e) => e.stopPropagation()}>
            <div style={S.modalTitle}>Add Workspace User</div>
            <form onSubmit={(e) => { void handleInvite(e); }}>
              {sendError && <div style={S.error}>{sendError}</div>}

              <div style={S.field}>
                <label style={S.label} htmlFor="wu-name">Full name</label>
                <input
                  id="wu-name"
                  type="text"
                  style={S.input}
                  value={inviteName}
                  onChange={(e) => setInviteName(e.target.value)}
                  placeholder="Jane Smith"
                  required
                  autoFocus
                />
              </div>

              <div style={S.field}>
                <label style={S.label} htmlFor="wu-email">Email address</label>
                <input
                  id="wu-email"
                  type="email"
                  style={S.input}
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="jane@company.com"
                  required
                />
              </div>

              <div style={S.field}>
                <label style={S.label} htmlFor="wu-password">Temporary password</label>
                <input
                  id="wu-password"
                  type="password"
                  style={S.input}
                  value={invitePassword}
                  onChange={(e) => setInvitePassword(e.target.value)}
                  placeholder="Minimum 8 characters"
                  required
                  minLength={8}
                />
                <div style={S.note}>
                  Share this with the user. They should change it after first login via /forgot-password.
                </div>
              </div>

              <div style={S.field}>
                <label style={S.label} htmlFor="wu-role">Role</label>
                <select
                  id="wu-role"
                  style={S.modalSelect}
                  value={inviteRoleId}
                  onChange={(e) => setInviteRoleId(e.target.value)}
                  required
                >
                  {roles.length === 0 && <option value="" disabled>No roles configured</option>}
                  {roles.map((r) => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))}
                </select>
              </div>

              <div style={S.modalActions}>
                <button
                  type="button"
                  style={S.cancelBtn}
                  onClick={() => setShowModal(false)}
                  disabled={sending}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{ ...S.primaryBtn, opacity: sending ? 0.6 : 1 }}
                  disabled={sending || roles.length === 0}
                >
                  {sending ? 'Creating…' : 'Create User'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
