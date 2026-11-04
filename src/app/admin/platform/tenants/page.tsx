'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Badge, Input, Select, Modal, Card, ConfirmDialog, Toast } from '@/components/ui';
import { Plus, RefreshCw, Ban, CheckCircle, Settings } from 'lucide-react';
import { DataTable } from '@/components/tables/DataTable';
import { formatDate } from '@/lib/utils';

interface Tenant {
  id: string;
  name: string;
  slug: string;
  plan: string;
  seatLimit: number;
  status: string;
  dbBackend: string;
  customDomain: string | null;
  createdAt: string;
}

export default function TenantsPage() {
  const router = useRouter();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [suspendId, setSuspendId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const [newTenant, setNewTenant] = useState({
    name: '', slug: '', plan: 'starter', seatLimit: 5,
    adminEmail: '', adminName: '', adminPassword: '', primaryColor: '#6366f1',
  });
  const [creating, setCreating] = useState(false);

  async function load() {
    setLoading(true);
    const d = await fetch('/api/platform/tenants').then((r) => r.json());
    setTenants(d.tenants ?? []);
    setLoading(false);
  }

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, []);

  async function createTenant() {
    setCreating(true);
    try {
      const res = await fetch('/api/platform/tenants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newTenant),
      });
      if (res.ok) {
        setCreateOpen(false);
        setToast({ message: 'Client created successfully', type: 'success' });
        load();
      } else {
        const err = await res.json();
        setToast({ message: err.error ?? 'Failed to create client', type: 'error' });
      }
    } finally {
      setCreating(false);
    }
  }

  async function toggleSuspend(tenant: Tenant) {
    const newStatus = tenant.status === 'SUSPENDED' ? 'ACTIVE' : 'SUSPENDED';
    await fetch(`/api/platform/tenants/${tenant.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    });
    setToast({ message: `Client ${newStatus === 'SUSPENDED' ? 'suspended' : 'reinstated'}`, type: 'success' });
    setSuspendId(null);
    load();
  }

  const suspendTarget = tenants.find((t) => t.id === suspendId);

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Clients</h1>
          <p className="text-sm text-slate-500 mt-1">Manage all LRBC ERP client tenants</p>
        </div>
        <Button icon={<Plus className="w-4 h-4" />} onClick={() => setCreateOpen(true)}>
          New client
        </Button>
      </div>

      <Card padding={false}>
        <DataTable<Tenant>
          loading={loading}
          data={tenants}
          total={tenants.length}
          columns={[
            { key: 'name', label: 'Client name', sortable: true },
            { key: 'slug', label: 'Slug', render: (v) => <span className="font-mono text-xs text-slate-500">{String(v)}</span> },
            { key: 'plan', label: 'Plan', type: 'badge', getBadgeColor: () => '#6366f1' },
            { key: 'seatLimit', label: 'Seat limit', type: 'number' },
            { key: 'status', label: 'Status', type: 'badge', getBadgeColor: (v) => v === 'ACTIVE' ? '#22c55e' : v === 'SUSPENDED' ? '#ef4444' : '#f59e0b' },
            { key: 'dbBackend', label: 'Database' },
            { key: 'createdAt', label: 'Created', type: 'date' },
          ]}
          rowActions={[
            {
              label: 'Suspend / Reinstate',
              icon: <Ban className="w-3.5 h-3.5" />,
              onClick: (t) => setSuspendId(t.id),
            },
            {
              label: 'Manage',
              icon: <Settings className="w-3.5 h-3.5" />,
              onClick: (t) => router.push(`/admin/platform/tenants/${t.id}`),
            },
            {
              label: 'View ERP',
              icon: <Settings className="w-3.5 h-3.5" />,
              onClick: (t) => window.open(`/${t.slug}/dashboard`, '_blank'),
            },
          ]}
          searchable
          emptyTitle="No clients yet"
          emptyDescription="Create your first client tenant to get started."
          emptyAction={<Button icon={<Plus className="w-4 h-4" />} onClick={() => setCreateOpen(true)}>New client</Button>}
        />
      </Card>

      {/* Create modal */}
      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Create new client" size="lg">
        <div className="grid grid-cols-2 gap-4">
          <Input label="Company name" value={newTenant.name}
            onChange={(e) => setNewTenant({ ...newTenant, name: e.target.value, slug: e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') })}
            required />
          <Input label="Slug (subdomain)" value={newTenant.slug}
            onChange={(e) => setNewTenant({ ...newTenant, slug: e.target.value })}
            hint={`URL: ${newTenant.slug || 'company'}.lrbc-erp.com`} required />
          <Select label="Plan" value={newTenant.plan}
            onChange={(e) => setNewTenant({ ...newTenant, plan: e.target.value })}
            options={[
              { value: 'starter', label: 'Starter' },
              { value: 'pro', label: 'Pro' },
              { value: 'enterprise', label: 'Enterprise' },
            ]} />
          <Input label="Seat limit" type="number" value={String(newTenant.seatLimit)}
            onChange={(e) => setNewTenant({ ...newTenant, seatLimit: parseInt(e.target.value) })} />
          <Input label="Admin name" value={newTenant.adminName}
            onChange={(e) => setNewTenant({ ...newTenant, adminName: e.target.value })} required />
          <Input label="Admin email" type="email" value={newTenant.adminEmail}
            onChange={(e) => setNewTenant({ ...newTenant, adminEmail: e.target.value })} required />
          <div className="col-span-2">
            <Input label="Admin password" type="password" value={newTenant.adminPassword}
              onChange={(e) => setNewTenant({ ...newTenant, adminPassword: e.target.value })}
              hint="Min 8 characters. Share securely with the client admin." required />
          </div>
        </div>
        <div className="flex gap-3 justify-end mt-6">
          <Button variant="secondary" onClick={() => setCreateOpen(false)}>Cancel</Button>
          <Button loading={creating} onClick={createTenant}>Create client</Button>
        </div>
      </Modal>

      {/* Suspend confirm */}
      <ConfirmDialog
        open={!!suspendId}
        onCancel={() => setSuspendId(null)}
        onConfirm={() => suspendTarget && toggleSuspend(suspendTarget)}
        title={suspendTarget?.status === 'SUSPENDED' ? 'Reinstate client' : 'Suspend client'}
        message={
          suspendTarget?.status === 'SUSPENDED'
            ? `Reinstate ${suspendTarget?.name}? All their users will be able to log in again immediately.`
            : `Suspend ${suspendTarget?.name}? All their users will be blocked from logging in immediately.`
        }
        confirmLabel={suspendTarget?.status === 'SUSPENDED' ? 'Reinstate' : 'Suspend'}
        variant={suspendTarget?.status === 'SUSPENDED' ? 'primary' : 'danger'}
      />

      {toast && (
        <Toast message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />
      )}
    </div>
  );
}
