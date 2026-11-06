'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams } from 'next/navigation';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Member {
  id: string;
  name: string;
  email: string;
  roleId: string | null;
  roleName: string | null;
  active: boolean;
  lastLogin: string | null;
  createdAt: string;
}

interface PendingInvite {
  id: string;
  email: string;
  roleId: string;
  roleName: string | null;
  token: string;
  status: string;
  expiresAt: string;
  createdAt: string;
}

interface Role {
  id: string;
  name: string;
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const S = {
  page: {
    maxWidth: 820,
    margin: '0 auto',
    padding: '32px 16px',
    fontFamily: 'Inter, system-ui, sans-serif',
    color: 'var(--fg, #111)',
  } as React.CSSProperties,

  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 32,
  } as React.CSSProperties,

  title: {
    fontSize: 22,
    fontWeight: 700,
    margin: 0,
  } as React.CSSProperties,

  subtitle: {
    fontSize: 13,
    color: 'var(--fg-muted, #6b7280)',
    marginTop: 4,
  } as React.CSSProperties,

  section: {
    marginBottom: 32,
  } as React.CSSProperties,

  sectionTitle: {
    fontSize: 14,
    fontWeight: 600,
    marginBottom: 12,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.06em',
    color: 'var(--fg-muted, #6b7280)',
  } as React.CSSProperties,

  card: {
    border: '1px solid var(--border, #e5e7eb)',
    borderRadius: 8,
    background: 'var(--surface, #fff)',
    overflow: 'hidden',
  } as React.CSSProperties,

  row: {
    display: 'flex',
    alignItems: 'center',
    padding: '14px 16px',
    borderBottom: '1px solid var(--border, #e5e7eb)',
    gap: 12,
  } as React.CSSProperties,

  avatar: (name: string): React.CSSProperties => {
    const colors = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444'];
    const idx = name.charCodeAt(0) % colors.length;
    return {
      width: 36,
      height: 36,
      borderRadius: '50%',
      background: colors[idx],
      color: '#fff',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontWeight: 600,
      fontSize: 14,
      flexShrink: 0,
    };
  },

  nameBlock: {
    flex: 1,
    minWidth: 0,
  } as React.CSSProperties,

  name: {
    fontWeight: 500,
    fontSize: 14,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  } as React.CSSProperties,

  email: {
    fontSize: 12,
    color: 'var(--fg-muted, #6b7280)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  } as React.CSSProperties,

  badge: (color: string): React.CSSProperties => ({
    display: 'inline-flex',
    alignItems: 'center',
    padding: '2px 8px',
    borderRadius: 99,
    fontSize: 11,
    fontWeight: 600,
    background: color + '22',
    color,
    flexShrink: 0,
  }),

  actionBtn: (variant: 'ghost' | 'danger' = 'ghost'): React.CSSProperties => ({
    padding: '5px 10px',
    border: '1px solid var(--border, #e5e7eb)',
    borderRadius: 5,
    background: variant === 'danger' ? '#fef2f2' : 'transparent',
    color: variant === 'danger' ? '#dc2626' : 'var(--fg, #111)',
    cursor: 'pointer',
    fontSize: 12,
    fontWeight: 500,
  }),

  primaryBtn: {
    padding: '9px 18px',
    border: 'none',
    borderRadius: 6,
    background: 'var(--accent, #6366f1)',
    color: '#fff',
    cursor: 'pointer',
    fontSize: 14,
    fontWeight: 500,
  } as React.CSSProperties,

  emptyState: {
    padding: '32px 16px',
    textAlign: 'center' as const,
    color: 'var(--fg-muted, #6b7280)',
    fontSize: 13,
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
    borderRadius: 10,
    padding: 24,
    width: 420,
    maxWidth: '95vw',
    boxShadow: '0 20px 50px rgba(0,0,0,0.15)',
  } as React.CSSProperties,

  modalTitle: {
    fontSize: 17,
    fontWeight: 700,
    marginBottom: 20,
  } as React.CSSProperties,

  field: {
    marginBottom: 16,
  } as React.CSSProperties,

  label: {
    display: 'block',
    fontSize: 12,
    fontWeight: 600,
    marginBottom: 5,
    color: 'var(--fg-muted, #6b7280)',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
  } as React.CSSProperties,

  input: {
    width: '100%',
    padding: '9px 12px',
    border: '1px solid var(--border, #e5e7eb)',
    borderRadius: 6,
    fontSize: 14,
    color: 'var(--fg, #111)',
    background: 'var(--surface, #fff)',
    boxSizing: 'border-box' as const,
  } as React.CSSProperties,

  select: {
    width: '100%',
    padding: '9px 12px',
    border: '1px solid var(--border, #e5e7eb)',
    borderRadius: 6,
    fontSize: 14,
    color: 'var(--fg, #111)',
    background: 'var(--surface, #fff)',
    boxSizing: 'border-box' as const,
  } as React.CSSProperties,

  modalActions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 24,
  } as React.CSSProperties,

  cancelBtn: {
    padding: '9px 18px',
    border: '1px solid var(--border, #e5e7eb)',
    borderRadius: 6,
    background: 'transparent',
    cursor: 'pointer',
    fontSize: 14,
  } as React.CSSProperties,

  error: {
    padding: '10px 14px',
    background: '#fef2f2',
    border: '1px solid #fecaca',
    borderRadius: 6,
    color: '#dc2626',
    fontSize: 13,
    marginBottom: 16,
  } as React.CSSProperties,
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function MembersPage() {
  const { appId } = useParams<{ appId: string }>();
  const [tenantSlug, setTenantSlug] = useState('');
  const [members, setMembers] = useState<Member[]>([]);
  const [invitations, setInvitations] = useState<PendingInvite[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  // Resolve tenantSlug from session
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
      const [membersRes, rolesRes] = await Promise.all([
        fetch(`/api/builder/apps/${appId}/members?tenant=${tenantSlug}`),
        fetch(`/api/builder/apps/${appId}/roles?tenant=${tenantSlug}`),
      ]);

      if (membersRes.ok) {
        const data = (await membersRes.json()) as { members: Member[]; invitations: PendingInvite[] };
        setMembers(data.members);
        setInvitations(data.invitations);
      }
      if (rolesRes.ok) {
        const data = (await rolesRes.json()) as { roles: Role[] };
        setRoles(data.roles);
        if (data.roles.length > 0 && !inviteRole) {
          setInviteRole(data.roles[0].id);
        }
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [appId, tenantSlug, inviteRole]);

  const loadRef = useRef(load);
  useEffect(() => { loadRef.current = load; }, [load]);
  useEffect(() => {
    if (tenantSlug) loadRef.current().catch((e: unknown) => setError(String(e)));
  }, [tenantSlug]);

  async function sendInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!inviteEmail || !inviteRole) return;
    setSending(true);
    setSendError(null);
    try {
      const res = await fetch(`/api/builder/apps/${appId}/members?tenant=${tenantSlug}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: inviteEmail, roleId: inviteRole }),
      });
      if (!res.ok) {
        const err = (await res.json()) as { error?: string };
        setSendError(err.error ?? 'Failed to send invite');
        return;
      }
      setShowModal(false);
      setInviteEmail('');
      await load();
    } catch (err) {
      setSendError(String(err));
    } finally {
      setSending(false);
    }
  }

  async function revokeInvite(invitationId: string) {
    await fetch(
      `/api/builder/apps/${appId}/members?tenant=${tenantSlug}&invitationId=${invitationId}`,
      { method: 'DELETE' },
    );
    await load();
  }

  async function resendInvite(invitation: PendingInvite) {
    // Revoke old + send new for the same email+role
    await revokeInvite(invitation.id);
    const res = await fetch(`/api/builder/apps/${appId}/members?tenant=${tenantSlug}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: invitation.email, roleId: invitation.roleId }),
    });
    if (!res.ok) {
      const err = (await res.json()) as { error?: string };
      setError(err.error ?? 'Resend failed');
    }
    await load();
  }

  function initials(name: string) {
    return name.slice(0, 1).toUpperCase();
  }

  function formatDate(iso: string | null) {
    if (!iso) return 'Never';
    return new Date(iso).toLocaleDateString(undefined, { dateStyle: 'medium' });
  }

  return (
    <div style={S.page}>
      {/* Header */}
      <div style={S.header}>
        <div>
          <h1 style={S.title}>Members</h1>
          <p style={S.subtitle}>Manage who has access to this app and their roles.</p>
        </div>
        <button style={S.primaryBtn} onClick={() => setShowModal(true)}>
          + Invite Member
        </button>
      </div>

      {error && <div style={S.error}>{error}</div>}

      {/* Active members */}
      <div style={S.section}>
        <div style={S.sectionTitle}>Active Members ({members.length})</div>
        <div style={S.card}>
          {loading && (
            <div style={S.emptyState}>Loading…</div>
          )}
          {!loading && members.length === 0 && (
            <div style={S.emptyState}>No members yet. Invite someone to get started.</div>
          )}
          {members.map((m, i) => (
            <div
              key={m.id}
              style={{ ...S.row, borderBottom: i < members.length - 1 ? S.row.borderBottom : 'none' }}
            >
              <div style={S.avatar(m.name)}>{initials(m.name)}</div>
              <div style={S.nameBlock}>
                <div style={S.name}>{m.name}</div>
                <div style={S.email}>{m.email}</div>
              </div>
              {m.roleName && (
                <span style={S.badge('#6366f1')}>{m.roleName}</span>
              )}
              <span
                style={S.badge(m.active ? '#10b981' : '#9ca3af')}
              >
                {m.active ? 'Active' : 'Inactive'}
              </span>
              <span style={{ fontSize: 11, color: 'var(--fg-muted, #6b7280)', flexShrink: 0 }}>
                Last login: {formatDate(m.lastLogin)}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Pending invitations */}
      {invitations.length > 0 && (
        <div style={S.section}>
          <div style={S.sectionTitle}>Pending Invitations ({invitations.length})</div>
          <div style={S.card}>
            {invitations.map((inv, i) => (
              <div
                key={inv.id}
                style={{ ...S.row, borderBottom: i < invitations.length - 1 ? S.row.borderBottom : 'none' }}
              >
                <div style={{ ...S.avatar(inv.email), background: '#f59e0b' }}>
                  {inv.email.slice(0, 1).toUpperCase()}
                </div>
                <div style={S.nameBlock}>
                  <div style={S.name}>{inv.email}</div>
                  <div style={S.email}>
                    Expires {formatDate(inv.expiresAt)}
                  </div>
                </div>
                {inv.roleName && (
                  <span style={S.badge('#6366f1')}>{inv.roleName}</span>
                )}
                <span style={S.badge('#f59e0b')}>Pending</span>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    style={S.actionBtn('ghost')}
                    onClick={() => resendInvite(inv)}
                  >
                    Resend
                  </button>
                  <button
                    style={S.actionBtn('danger')}
                    onClick={() => revokeInvite(inv.id)}
                  >
                    Revoke
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Invite modal */}
      {showModal && (
        <div style={S.overlay} onClick={() => setShowModal(false)}>
          <div style={S.modal} onClick={(e) => e.stopPropagation()}>
            <div style={S.modalTitle}>Invite Member</div>
            <form onSubmit={(e) => { void sendInvite(e); }}>
              {sendError && <div style={S.error}>{sendError}</div>}
              <div style={S.field}>
                <label style={S.label} htmlFor="invite-email">Email address</label>
                <input
                  id="invite-email"
                  type="email"
                  style={S.input}
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="colleague@company.com"
                  required
                />
              </div>
              <div style={S.field}>
                <label style={S.label} htmlFor="invite-role">Role</label>
                <select
                  id="invite-role"
                  style={S.select}
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value)}
                  required
                >
                  {roles.length === 0 && (
                    <option value="" disabled>No roles configured</option>
                  )}
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
                  {sending ? 'Sending…' : 'Send Invite'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
