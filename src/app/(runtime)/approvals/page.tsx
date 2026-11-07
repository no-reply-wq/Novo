'use client';
/**
 * Approval Inbox - /approvals (spec 3.3)
 */

import { useCallback, useEffect, useState } from 'react';

interface InboxItem {
  id: string;
  chainName: string;
  tableApiKey: string;
  recordId: string;
  currentLevel: number;
  createdAt: string;
  status: string;
}

type Decision = 'approved' | 'rejected' | 'delegated';

export default function ApprovalsPage() {
  const [items, setItems] = useState<InboxItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<{ requestId: string; decision: Decision } | null>(null);
  const [comment, setComment] = useState('');
  const [delegateTo, setDelegateTo] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const userId = 'me';

  const fetchInbox = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/runtime/approvals/inbox?userId=' + userId);
      const data = (await res.json()) as { requests: InboxItem[] };
      setItems(data.requests ?? []);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { void fetchInbox(); }, [fetchInbox]);

  async function handleDecide() {
    if (!modal) return;
    setSubmitting(true);
    try {
      await fetch('/api/runtime/approvals/' + modal.requestId + '/decide', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-approver-id': userId },
        body: JSON.stringify({
          decision: modal.decision,
          comment: comment || undefined,
          delegateTo: modal.decision === 'delegated' ? delegateTo : undefined,
        }),
      });
      setModal(null);
      setComment('');
      setDelegateTo('');
      void fetchInbox();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <h1 className="text-2xl font-semibold mb-4">Pending Approvals</h1>
      {loading ? (
        <p className="text-muted-foreground">Loading...</p>
      ) : items.length === 0 ? (
        <p className="text-muted-foreground">No pending items.</p>
      ) : (
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th className="py-2 pr-4">Record</th>
              <th className="py-2 pr-4">Table</th>
              <th className="py-2 pr-4">Chain</th>
              <th className="py-2 pr-4">Level</th>
              <th className="py-2 pr-4">Waiting since</th>
              <th className="py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className="border-b hover:bg-muted/30">
                <td className="py-2 pr-4 font-mono text-xs">{item.recordId}</td>
                <td className="py-2 pr-4">{item.tableApiKey}</td>
                <td className="py-2 pr-4">{item.chainName}</td>
                <td className="py-2 pr-4 text-center">{item.currentLevel}</td>
                <td className="py-2 pr-4">{new Date(item.createdAt).toLocaleDateString()}</td>
                <td className="py-2 flex gap-2">
                  <button onClick={() => { setModal({ requestId: item.id, decision: 'approved' }); setComment(''); setDelegateTo(''); }} className="px-3 py-1 rounded bg-green-600 text-white text-xs">Approve</button>
                  <button onClick={() => { setModal({ requestId: item.id, decision: 'rejected' }); setComment(''); setDelegateTo(''); }} className="px-3 py-1 rounded bg-red-600 text-white text-xs">Reject</button>
                  <button onClick={() => { setModal({ requestId: item.id, decision: 'delegated' }); setComment(''); setDelegateTo(''); }} className="px-3 py-1 rounded bg-blue-600 text-white text-xs">Delegate</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {modal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-background border rounded-lg p-6 w-96 shadow-xl">
            <h2 className="text-lg font-semibold mb-4 capitalize">{modal.decision}</h2>
            <label className="block text-sm mb-1">Comment (optional)</label>
            <textarea value={comment} onChange={(e) => setComment(e.target.value)} className="w-full border rounded p-2 text-sm mb-3 resize-none" rows={3} />
            {modal.decision === 'delegated' && (
              <>
                <label className="block text-sm mb-1">Delegate to (user ID)</label>
                <input value={delegateTo} onChange={(e) => setDelegateTo(e.target.value)} className="w-full border rounded p-2 text-sm mb-3" />
              </>
            )}
            <div className="flex justify-end gap-2">
              <button onClick={() => setModal(null)} className="px-4 py-2 text-sm border rounded">Cancel</button>
              <button onClick={() => void handleDecide()} disabled={submitting} className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded disabled:opacity-50">{submitting ? 'Saving...' : 'Confirm'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
