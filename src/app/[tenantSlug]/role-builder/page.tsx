'use client';
import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';

interface Role { id: string; name: string; description: string; color: string; is_admin: boolean; }
interface Permission { id: string; role_id: string; resource: string; can_view: boolean; can_create: boolean; can_edit: boolean; can_delete: boolean; }
interface UserRole { id: string; user_email: string; role_id: string; }
interface TableMeta { id: string; slug: string; label: string; }
interface NavItem { id: string; label: string; href: string; }

const COLORS = ['#6366f1','#8b5cf6','#ec4899','#ef4444','#f97316','#eab308','#22c55e','#14b8a6','#06b6d4','#3b82f6','#64748b','#0f172a'];

export default function RoleBuilderPage() {
  const { tenantSlug } = useParams<{ tenantSlug: string }>();
  const [roles, setRoles] = useState<Role[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [userRoles, setUserRoles] = useState<UserRole[]>([]);
  const [tables, setTables] = useState<TableMeta[]>([]);
  const [navItems, setNavItems] = useState<NavItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);
  const [showRoleForm, setShowRoleForm] = useState(false);
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [newUserEmail, setNewUserEmail] = useState('');
  const [saved, setSaved] = useState('');
  const [activeTab, setActiveTab] = useState<'tables' | 'nav' | 'users'>('tables');

  const load = useCallback(async () => {
    setLoading(true);
    const [rolesRes, tablesRes, navRes] = await Promise.all([
      fetch(`/api/platform/roles?tenant=${tenantSlug}`).then(r => r.json()),
      fetch(`/api/platform/tables?tenant=${tenantSlug}`).then(r => r.json()),
      fetch(`/api/platform/nav?tenant=${tenantSlug}`).then(r => r.json()),
    ]);
    setRoles(rolesRes.roles ?? []);
    setPermissions(rolesRes.permissions ?? []);
    setUserRoles(rolesRes.userRoles ?? []);
    setTables(tablesRes.tables ?? []);
    setNavItems(navRes.items ?? []);
    setLoading(false);
  }, [tenantSlug]);

  useEffect(() => { load(); }, [load]);

  const saveRole = async (data: Partial<Role>) => {
    const r = await fetch(`/api/platform/roles?tenant=${tenantSlug}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'save_role', ...data }),
    });
    const d = await r.json();
    if (!r.ok) { alert(d.error); return; }
    setSaved('Role saved'); setTimeout(() => setSaved(''), 2000);
    await load();
    setShowRoleForm(false); setEditingRole(null);
    if (!data.id) setSelectedRole(d.role);
  };

  const deleteRole = async (roleId: string) => {
    if (!confirm('Delete this role? Users assigned this role will lose it.')) return;
    await fetch(`/api/platform/roles?tenant=${tenantSlug}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'delete_role', roleId }) });
    if (selectedRole?.id === roleId) setSelectedRole(null);
    load();
  };

  const getPerms = (resource: string) => permissions.find(p => p.role_id === selectedRole?.id && p.resource === resource);

  const savePerms = async (resource: string, perms: Partial<Permission>) => {
    await fetch(`/api/platform/roles?tenant=${tenantSlug}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'save_permission', role_id: selectedRole?.id, resource, ...perms }),
    });
    setSaved('Saved'); setTimeout(() => setSaved(''), 1500);
    load();
  };

  const removePerms = async (resource: string) => {
    await fetch(`/api/platform/roles?tenant=${tenantSlug}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'delete_permission', role_id: selectedRole?.id, resource }),
    });
    load();
  };

  const assignUser = async () => {
    if (!newUserEmail.trim() || !selectedRole) return;
    await fetch(`/api/platform/roles?tenant=${tenantSlug}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'assign_user', user_email: newUserEmail.trim(), role_id: selectedRole.id }),
    });
    setNewUserEmail(''); setSaved('User assigned'); setTimeout(() => setSaved(''), 2000); load();
  };

  const removeUser = async (email: string) => {
    await fetch(`/api/platform/roles?tenant=${tenantSlug}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'remove_user', user_email: email, role_id: selectedRole?.id }),
    });
    load();
  };

  const roleUsers = userRoles.filter(ur => ur.role_id === selectedRole?.id);
  const inp: React.CSSProperties = { width: '100%', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '8px 12px', fontSize: '13px', boxSizing: 'border-box', outline: 'none' };
  const tabBtn = (tab: typeof activeTab) => ({
    padding: '8px 16px', border: 'none', borderRadius: '6px', cursor: 'pointer' as const,
    backgroundColor: activeTab === tab ? '#6366f1' : 'transparent',
    color: activeTab === tab ? '#fff' : '#64748b', fontSize: '13px', fontWeight: '600' as const,
  });

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', fontFamily: 'system-ui,sans-serif', fontSize: '13px' }}>

      {/* Left: Roles list */}
      <div style={{ width: '260px', flexShrink: 0, backgroundColor: '#0f172a', color: '#f1f5f9', display: 'flex', flexDirection: 'column', borderRight: '1px solid #1e293b' }}>
        <div style={{ padding: '16px', borderBottom: '1px solid #1e293b', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <p style={{ fontWeight: '700', fontSize: '14px', margin: 0 }}>Role Builder</p>
            <p style={{ fontSize: '11px', color: '#64748b', margin: '2px 0 0' }}>{roles.length} roles</p>
          </div>
          <button onClick={() => { setEditingRole(null); setShowRoleForm(true); }} style={{ backgroundColor: '#6366f1', border: 'none', color: '#fff', borderRadius: '6px', padding: '6px 12px', cursor: 'pointer', fontSize: '12px', fontWeight: '600' }}>+ New</button>
        </div>
        <div style={{ flex: 1, overflow: 'auto', padding: '8px' }}>
          {loading ? <p style={{ color: '#64748b', textAlign: 'center', padding: '24px', fontSize: '12px' }}>Loading...</p>
          : roles.length === 0 ? (
            <div style={{ padding: '24px', textAlign: 'center' }}>
              <p style={{ color: '#64748b', fontSize: '12px', marginBottom: '12px' }}>No roles yet</p>
              <button onClick={() => setShowRoleForm(true)} style={{ backgroundColor: '#6366f1', border: 'none', color: '#fff', borderRadius: '6px', padding: '8px 16px', cursor: 'pointer', fontSize: '12px' }}>Create first role</button>
            </div>
          ) : roles.map(role => (
            <div key={role.id} onClick={() => setSelectedRole(role)}
              style={{ padding: '10px 12px', borderRadius: '8px', cursor: 'pointer', marginBottom: '2px', backgroundColor: selectedRole?.id === role.id ? '#1e293b' : 'transparent', display: 'flex', alignItems: 'center', gap: '10px' }}
              onMouseEnter={e => { if (selectedRole?.id !== role.id) (e.currentTarget as HTMLElement).style.backgroundColor = '#1e293b'; }}
              onMouseLeave={e => { if (selectedRole?.id !== role.id) (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent'; }}>
              <div style={{ width: '28px', height: '28px', borderRadius: '50%', backgroundColor: role.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: '700', color: '#fff', flexShrink: 0 }}>{role.name.slice(0,1).toUpperCase()}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, fontWeight: '600', color: '#f1f5f9', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  {role.name}
                  {role.is_admin && <span style={{ fontSize: '9px', backgroundColor: '#fbbf24', color: '#92400e', padding: '1px 5px', borderRadius: '4px', fontWeight: '700' }}>ADMIN</span>}
                </p>
                <p style={{ margin: 0, fontSize: '11px', color: '#64748b' }}>{userRoles.filter(ur => ur.role_id === role.id).length} users</p>
              </div>
              <div style={{ display: 'flex', gap: '4px' }}>
                <button onClick={e => { e.stopPropagation(); setEditingRole(role); setShowRoleForm(true); }} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#64748b', fontSize: '12px' }}>✎</button>
                <button onClick={e => { e.stopPropagation(); deleteRole(role.id); }} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#64748b', fontSize: '14px' }}>🗑</button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Right: Permission editor */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', backgroundColor: '#f8fafc' }}>
        {!selectedRole ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '12px', color: '#94a3b8' }}>
            <div style={{ fontSize: '48px' }}>🔐</div>
            <p style={{ fontSize: '16px', fontWeight: '600', color: '#0f172a' }}>Select a role to configure permissions</p>
            <button onClick={() => setShowRoleForm(true)} style={{ backgroundColor: '#6366f1', border: 'none', color: '#fff', borderRadius: '8px', padding: '10px 20px', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}>+ Create Role</button>
          </div>
        ) : (
          <>
            {/* Header */}
            <div style={{ padding: '16px 24px', backgroundColor: '#fff', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ width: '36px', height: '36px', borderRadius: '50%', backgroundColor: selectedRole.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px', fontWeight: '700', color: '#fff' }}>{selectedRole.name.slice(0,1).toUpperCase()}</div>
              <div style={{ flex: 1 }}>
                <h2 style={{ margin: 0, fontSize: '16px', fontWeight: '700', color: '#0f172a' }}>{selectedRole.name} {selectedRole.is_admin && <span style={{ fontSize: '11px', backgroundColor: '#fef3c7', color: '#92400e', padding: '2px 8px', borderRadius: '4px' }}>Admin — full access</span>}</h2>
                <p style={{ margin: 0, fontSize: '12px', color: '#64748b' }}>{selectedRole.description || 'No description'}</p>
              </div>
              {saved && <span style={{ fontSize: '12px', color: '#10b981', fontWeight: '600' }}>✓ {saved}</span>}
              <div style={{ display: 'flex', gap: '4px', backgroundColor: '#f1f5f9', borderRadius: '8px', padding: '4px' }}>
                <button style={tabBtn('tables')} onClick={() => setActiveTab('tables')}>Tables</button>
                <button style={tabBtn('nav')} onClick={() => setActiveTab('nav')}>Navigation</button>
                <button style={tabBtn('users')} onClick={() => setActiveTab('users')}>Users</button>
              </div>
            </div>

            {/* Content */}
            <div style={{ flex: 1, overflow: 'auto', padding: '24px' }}>
              {selectedRole.is_admin ? (
                <div style={{ backgroundColor: '#fef3c7', border: '1px solid #fde68a', borderRadius: '12px', padding: '20px', textAlign: 'center' }}>
                  <p style={{ margin: 0, fontWeight: '600', color: '#92400e', fontSize: '14px' }}>⭐ Admin role has full access to everything</p>
                  <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#b45309' }}>No individual permissions needed — admins can see and do everything.</p>
                </div>
              ) : (
                <>
                  {activeTab === 'tables' && (
                    <div>
                      <p style={{ fontSize: '11px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '12px' }}>Table Permissions ({tables.length} tables)</p>
                      {tables.length === 0 ? <p style={{ color: '#94a3b8', fontSize: '13px' }}>No tables created yet. Create tables in Table Builder first.</p> : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          {tables.map(t => {
                            const resource = `table:${t.slug}`;
                            const p = getPerms(resource);
                            return (
                              <div key={t.id} style={{ backgroundColor: '#fff', border: `1px solid ${p ? '#6366f1' : '#e2e8f0'}`, borderRadius: '10px', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '16px' }}>
                                <div style={{ width: '32px', height: '32px', borderRadius: '6px', backgroundColor: p ? '#eff6ff' : '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px', flexShrink: 0 }}>🗄</div>
                                <div style={{ flex: 1 }}>
                                  <p style={{ margin: 0, fontWeight: '600', color: '#0f172a', fontSize: '13px' }}>{t.label}</p>
                                  <p style={{ margin: 0, fontSize: '11px', color: '#64748b' }}>ct_{t.slug}</p>
                                </div>
                                {!p ? (
                                  <button onClick={() => savePerms(resource, { can_view: true, can_create: false, can_edit: false, can_delete: false })}
                                    style={{ padding: '6px 14px', border: '1px dashed #6366f1', borderRadius: '6px', cursor: 'pointer', backgroundColor: '#fff', color: '#6366f1', fontSize: '12px', fontWeight: '600' }}>+ Grant Access</button>
                                ) : (
                                  <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                                    {(['can_view','can_create','can_edit','can_delete'] as const).map(perm => (
                                      <label key={perm} style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', fontSize: '11px', color: '#374151', textTransform: 'capitalize' }}>
                                        <input type="checkbox" checked={!!(p as unknown as Record<string, boolean>)[perm]} onChange={e => savePerms(resource, { ...p, [perm]: e.target.checked })} />
                                        {perm.replace('can_', '')}
                                      </label>
                                    ))}
                                    <button onClick={() => removePerms(resource)} style={{ border: '1px solid #fecaca', borderRadius: '4px', padding: '3px 8px', cursor: 'pointer', backgroundColor: '#fff', fontSize: '11px', color: '#ef4444' }}>Revoke</button>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}

                  {activeTab === 'nav' && (
                    <div>
                      <p style={{ fontSize: '11px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '12px' }}>Navigation Permissions</p>
                      {navItems.length === 0 ? <p style={{ color: '#94a3b8', fontSize: '13px' }}>No custom nav items. Add them in Nav Builder first.</p> : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          {navItems.map(item => {
                            const resource = `nav:${item.id}`;
                            const p = getPerms(resource);
                            return (
                              <div key={item.id} style={{ backgroundColor: '#fff', border: `1px solid ${p ? '#6366f1' : '#e2e8f0'}`, borderRadius: '10px', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '16px' }}>
                                <div style={{ width: '32px', height: '32px', borderRadius: '6px', backgroundColor: p ? '#eff6ff' : '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px', flexShrink: 0 }}>📋</div>
                                <div style={{ flex: 1 }}>
                                  <p style={{ margin: 0, fontWeight: '600', color: '#0f172a', fontSize: '13px' }}>{item.label}</p>
                                  <p style={{ margin: 0, fontSize: '11px', color: '#64748b' }}>{item.href}</p>
                                </div>
                                {!p ? (
                                  <button onClick={() => savePerms(resource, { can_view: true, can_create: false, can_edit: false, can_delete: false })}
                                    style={{ padding: '6px 14px', border: '1px dashed #6366f1', borderRadius: '6px', cursor: 'pointer', backgroundColor: '#fff', color: '#6366f1', fontSize: '12px', fontWeight: '600' }}>+ Show to role</button>
                                ) : (
                                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                    <span style={{ fontSize: '11px', color: '#10b981', fontWeight: '600' }}>✓ Visible</span>
                                    <button onClick={() => removePerms(resource)} style={{ border: '1px solid #fecaca', borderRadius: '4px', padding: '3px 8px', cursor: 'pointer', backgroundColor: '#fff', fontSize: '11px', color: '#ef4444' }}>Hide</button>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}

                  {activeTab === 'users' && (
                    <div>
                      <p style={{ fontSize: '11px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '12px' }}>Assigned Users ({roleUsers.length})</p>
                      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                        <input value={newUserEmail} onChange={e => setNewUserEmail(e.target.value)} onKeyDown={e => e.key === 'Enter' && assignUser()} style={{ ...inp, flex: 1 }} placeholder="user@email.com" type="email" />
                        <button onClick={assignUser} style={{ padding: '8px 16px', border: 'none', borderRadius: '8px', backgroundColor: '#6366f1', color: '#fff', cursor: 'pointer', fontSize: '13px', fontWeight: '600', whiteSpace: 'nowrap' }}>Assign User</button>
                      </div>
                      {roleUsers.length === 0 ? (
                        <p style={{ color: '#94a3b8', fontSize: '13px', textAlign: 'center', padding: '24px' }}>No users assigned to this role yet</p>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          {roleUsers.map(ur => (
                            <div key={ur.id} style={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                              <div style={{ width: '32px', height: '32px', borderRadius: '50%', backgroundColor: '#6366f1', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', fontWeight: '700', color: '#fff', flexShrink: 0 }}>{ur.user_email.slice(0,1).toUpperCase()}</div>
                              <p style={{ margin: 0, flex: 1, color: '#0f172a', fontSize: '13px', fontWeight: '500' }}>{ur.user_email}</p>
                              <button onClick={() => removeUser(ur.user_email)} style={{ border: '1px solid #fecaca', borderRadius: '6px', padding: '4px 10px', cursor: 'pointer', backgroundColor: '#fff', fontSize: '11px', color: '#ef4444' }}>Remove</button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          </>
        )}
      </div>

      {/* Role Form Modal */}
      {showRoleForm && (
        <RoleFormModal role={editingRole} colors={COLORS} inp={inp}
          onClose={() => { setShowRoleForm(false); setEditingRole(null); }}
          onSave={saveRole} />
      )}
    </div>
  );
}

function RoleFormModal({ role, colors, inp, onClose, onSave }: { role: Role | null; colors: string[]; inp: React.CSSProperties; onClose: () => void; onSave: (data: Partial<Role>) => void; }) {
  const [name, setName] = useState(role?.name ?? '');
  const [description, setDescription] = useState(role?.description ?? '');
  const [color, setColor] = useState(role?.color ?? '#6366f1');
  const [isAdmin, setIsAdmin] = useState(role?.is_admin ?? false);

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)' }} />
      <div style={{ position: 'relative', backgroundColor: '#fff', borderRadius: '16px', padding: '24px', width: '100%', maxWidth: '440px', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
          <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '700', color: '#0f172a' }}>{role ? 'Edit Role' : 'Create Role'}</h3>
          <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '20px', color: '#64748b' }}>×</button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: '#64748b', marginBottom: '6px', textTransform: 'uppercase' }}>Role Name *</label>
            <input value={name} onChange={e => setName(e.target.value)} style={inp} placeholder="e.g. Manager, Sales Rep, Viewer" autoFocus />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: '#64748b', marginBottom: '6px', textTransform: 'uppercase' }}>Description</label>
            <input value={description} onChange={e => setDescription(e.target.value)} style={inp} placeholder="What can this role do?" />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: '#64748b', marginBottom: '8px', textTransform: 'uppercase' }}>Color</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {colors.map(c => <div key={c} onClick={() => setColor(c)} style={{ width: '24px', height: '24px', borderRadius: '50%', backgroundColor: c, cursor: 'pointer', border: color === c ? '3px solid #0f172a' : '3px solid transparent', transition: 'all 0.1s' }} />)}
            </div>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px', padding: '10px', backgroundColor: '#fef3c7', borderRadius: '8px', border: '1px solid #fde68a' }}>
            <input type="checkbox" checked={isAdmin} onChange={e => setIsAdmin(e.target.checked)} />
            <div>
              <p style={{ margin: 0, fontWeight: '600', color: '#92400e' }}>Administrator role</p>
              <p style={{ margin: 0, fontSize: '11px', color: '#b45309' }}>Full access to everything — no individual permissions needed</p>
            </div>
          </label>

          {/* Preview */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px', backgroundColor: '#f8fafc', borderRadius: '8px' }}>
            <div style={{ width: '32px', height: '32px', borderRadius: '50%', backgroundColor: color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', fontWeight: '700', color: '#fff' }}>{name.slice(0,1).toUpperCase() || '?'}</div>
            <div>
              <p style={{ margin: 0, fontWeight: '600', color: '#0f172a', fontSize: '13px' }}>{name || 'Role Name'}</p>
              <p style={{ margin: 0, fontSize: '11px', color: '#64748b' }}>{description || 'No description'}</p>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', paddingTop: '8px', borderTop: '1px solid #e2e8f0' }}>
            <button onClick={onClose} style={{ padding: '8px 16px', border: '1px solid #e2e8f0', borderRadius: '8px', cursor: 'pointer', backgroundColor: '#fff', fontSize: '13px', fontWeight: '600' }}>Cancel</button>
            <button onClick={() => onSave({ id: role?.id, name, description, color, is_admin: isAdmin })} style={{ padding: '8px 16px', border: 'none', borderRadius: '8px', cursor: 'pointer', backgroundColor: '#6366f1', color: '#fff', fontSize: '13px', fontWeight: '600' }}>{role ? 'Update' : 'Create Role'}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
