'use client';

import { useState, useEffect } from 'react';
import { Button, Input, Card, Modal, Toast, Badge } from '@/components/ui';
import { Plus, Shield } from 'lucide-react';
import { formatDate } from '@/lib/utils';

interface PlatformAdmin {
  id: string;
  name: string;
  email: string;
  createdAt: string;
}

export default function PlatformAdminsPage() {
  const [admins, setAdmins] = useState<PlatformAdmin[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [draft, setDraft] = useState({ name: '', email: '', password: '' });
  const [saving, setSaving] = useState(false);

  async function load() {
    const d = await fetch('/api/platform/admins').then(r => r.json());
    setAdmins(d.admins ?? []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function create() {
    setSaving(true);
    try {
      const res = await fetch('/api/platform/admins', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      });
      if (res.ok) {
        setCreateOpen(false);
        setDraft({ name: '', email: '', password: '' });
        setToast({ message: 'Staff member added', type: 'success' });
        load();
      } else {
        const err = await res.json();
        setToast({ message: err.error ?? 'Failed to create', type: 'error' });
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Platform staff</h1>
          <p className="text-sm text-slate-500 mt-1">LRBC team members with super admin access</p>
        </div>
        <Button icon={<Plus className="w-4 h-4" />} onClick={() => setCreateOpen(true)}>
          Add staff member
        </Button>
      </div>

      <Card padding={false}>
        {loading ? (
          <p className="p-6 text-slate-400 text-sm">Loading…</p>
        ) : admins.length === 0 ? (
          <p className="p-6 text-slate-400 text-sm">No staff members yet.</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {admins.map(admin => (
              <div key={admin.id} className="flex items-center gap-4 px-6 py-4">
                <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center">
                  <Shield className="w-5 h-5 text-indigo-600" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-slate-800">{admin.name}</p>
                  <p className="text-xs text-slate-400">{admin.email}</p>
                </div>
                <Badge variant="info">Super Admin</Badge>
                <p className="text-xs text-slate-400">Added {formatDate(admin.createdAt)}</p>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Add staff member" size="sm">
        <div className="space-y-4">
          <Input label="Name" value={draft.name}
            onChange={e => setDraft({ ...draft, name: e.target.value })} required />
          <Input label="Email" type="email" value={draft.email}
            onChange={e => setDraft({ ...draft, email: e.target.value })} required />
          <Input label="Password" type="password" value={draft.password}
            onChange={e => setDraft({ ...draft, password: e.target.value })}
            hint="Min 8 characters" required />
          <div className="flex gap-3 justify-end">
            <Button variant="secondary" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button loading={saving} onClick={create}>Add member</Button>
          </div>
        </div>
      </Modal>

      {toast && <Toast message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />}
    </div>
  );
}