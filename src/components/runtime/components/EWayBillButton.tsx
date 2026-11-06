'use client';

import React, { useState } from 'react';
import { Loader2, CheckCircle, XCircle, RefreshCw, AlertCircle } from 'lucide-react';

export interface EWayBillButtonProps {
  tenantSlug: string;
  tableId: string;
  recordId: string;
  currentEwbNo?: string;
  validTill?: string;
  currentStatus?: string;
}

interface ExtendFormState {
  vehicleNo: string;
  fromPlace: string;
  fromState: number;
  remainingDistance: number;
  transMode: string;
  extnRsnCode: number;
  extnRemarks: string;
}

const DEFAULT_EXTEND_FORM: ExtendFormState = {
  vehicleNo: '',
  fromPlace: '',
  fromState: 0,
  remainingDistance: 0,
  transMode: '1',
  extnRsnCode: 1,
  extnRemarks: '',
};

export function EWayBillButton({
  tenantSlug,
  tableId,
  recordId,
  currentEwbNo,
  validTill,
  currentStatus,
}: EWayBillButtonProps) {
  const [loading, setLoading] = useState(false);
  const [ewbNo, setEwbNo] = useState(currentEwbNo ?? '');
  const [ewbValidTill, setEwbValidTill] = useState(validTill ?? '');
  const [status, setStatus] = useState(currentStatus ?? 'pending');
  const [errorMessage, setErrorMessage] = useState('');
  const [showExtend, setShowExtend] = useState(false);
  const [extendForm, setExtendForm] = useState<ExtendFormState>(DEFAULT_EXTEND_FORM);

  const isGenerated = status === 'generated' || status === 'extended';
  const isCancelled = status === 'cancelled';

  async function handleGenerate() {
    setLoading(true);
    setErrorMessage('');
    try {
      const res = await fetch('/api/runtime/ewaybill/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tableId, recordId }),
      });
      const data = (await res.json()) as {
        success?: boolean;
        error?: string;
        ewb?: { ewbNo: string; ewbValidTill: string; status: string };
      };
      if (!res.ok || !data.success) {
        setErrorMessage(data.error ?? 'Generation failed');
        setStatus('error');
        return;
      }
      if (data.ewb) {
        setEwbNo(data.ewb.ewbNo);
        setEwbValidTill(data.ewb.ewbValidTill);
        setStatus('generated');
      }
    } catch {
      setErrorMessage('Network error');
      setStatus('error');
    } finally {
      setLoading(false);
    }
  }

  async function handleCancel() {
    if (!confirm('Cancel this E-Way Bill?')) return;
    setLoading(true);
    setErrorMessage('');
    try {
      const res = await fetch('/api/runtime/ewaybill/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tableId,
          recordId,
          cancelRsnCode: 2,
          cancelRmrk: 'Cancelled by user',
        }),
      });
      const data = (await res.json()) as { success?: boolean; error?: string };
      if (!res.ok || !data.success) {
        setErrorMessage(data.error ?? 'Cancel failed');
        return;
      }
      setStatus('cancelled');
      setEwbNo('');
    } catch {
      setErrorMessage('Network error');
    } finally {
      setLoading(false);
    }
  }

  async function handleExtend() {
    setLoading(true);
    setErrorMessage('');
    try {
      const res = await fetch('/api/runtime/ewaybill/extend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tableId, recordId, ...extendForm }),
      });
      const data = (await res.json()) as { success?: boolean; error?: string; validTill?: string };
      if (!res.ok || !data.success) {
        setErrorMessage(data.error ?? 'Extension failed');
        return;
      }
      if (data.validTill) setEwbValidTill(data.validTill);
      setStatus('extended');
      setShowExtend(false);
    } catch {
      setErrorMessage('Network error');
    } finally {
      setLoading(false);
    }
  }

  const tenantRef = tenantSlug; // used for keying only

  if (!isGenerated && !isCancelled) {
    return (
      <div className="flex flex-col gap-2" data-tenant={tenantRef}>
        {status === 'error' && errorMessage && (
          <div className="flex items-center gap-1 rounded bg-red-50 px-3 py-1.5 text-xs text-red-700">
            <AlertCircle className="h-3.5 w-3.5" />
            {errorMessage}
          </div>
        )}
        <button
          onClick={handleGenerate}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Generate E-Way Bill
        </button>
      </div>
    );
  }

  if (isCancelled) {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <XCircle className="h-4 w-4 text-red-400" />
        EWB Cancelled
      </div>
    );
  }

  // isGenerated
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-800">
          <CheckCircle className="h-3.5 w-3.5" />
          EWB: {ewbNo}
        </span>
        {ewbValidTill && (
          <span className="text-xs text-gray-500">Valid till: {ewbValidTill}</span>
        )}
      </div>

      {errorMessage && (
        <div className="flex items-center gap-1 rounded bg-red-50 px-3 py-1.5 text-xs text-red-700">
          <AlertCircle className="h-3.5 w-3.5" />
          {errorMessage}
        </div>
      )}

      <div className="flex gap-2">
        <button
          onClick={() => setShowExtend(true)}
          disabled={loading}
          className="inline-flex items-center gap-1 rounded border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Extend
        </button>
        <button
          onClick={handleCancel}
          disabled={loading}
          className="inline-flex items-center gap-1 rounded border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-60"
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <XCircle className="h-3.5 w-3.5" />}
          Cancel EWB
        </button>
      </div>

      {showExtend && (
        <div className="mt-2 rounded-md border border-gray-200 bg-gray-50 p-3">
          <p className="mb-2 text-xs font-medium text-gray-700">Extend E-Way Bill Validity</p>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs text-gray-500">Vehicle No</label>
              <input
                type="text"
                value={extendForm.vehicleNo}
                onChange={(e) => setExtendForm((f) => ({ ...f, vehicleNo: e.target.value }))}
                className="mt-0.5 w-full rounded border border-gray-300 px-2 py-1 text-xs"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500">From Place</label>
              <input
                type="text"
                value={extendForm.fromPlace}
                onChange={(e) => setExtendForm((f) => ({ ...f, fromPlace: e.target.value }))}
                className="mt-0.5 w-full rounded border border-gray-300 px-2 py-1 text-xs"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500">From State Code</label>
              <input
                type="number"
                value={extendForm.fromState}
                onChange={(e) => setExtendForm((f) => ({ ...f, fromState: Number(e.target.value) }))}
                className="mt-0.5 w-full rounded border border-gray-300 px-2 py-1 text-xs"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500">Remaining Distance (km)</label>
              <input
                type="number"
                value={extendForm.remainingDistance}
                onChange={(e) =>
                  setExtendForm((f) => ({ ...f, remainingDistance: Number(e.target.value) }))
                }
                className="mt-0.5 w-full rounded border border-gray-300 px-2 py-1 text-xs"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500">Transport Mode</label>
              <select
                value={extendForm.transMode}
                onChange={(e) => setExtendForm((f) => ({ ...f, transMode: e.target.value }))}
                className="mt-0.5 w-full rounded border border-gray-300 px-2 py-1 text-xs"
              >
                <option value="1">Road</option>
                <option value="2">Rail</option>
                <option value="3">Air</option>
                <option value="4">Ship</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500">Extension Reason</label>
              <select
                value={extendForm.extnRsnCode}
                onChange={(e) =>
                  setExtendForm((f) => ({ ...f, extnRsnCode: Number(e.target.value) }))
                }
                className="mt-0.5 w-full rounded border border-gray-300 px-2 py-1 text-xs"
              >
                <option value={1}>Natural Calamity</option>
                <option value={2}>Law & Order Situation</option>
                <option value={3}>Transhipment</option>
                <option value={4}>Accident</option>
                <option value={99}>Others</option>
              </select>
            </div>
          </div>
          <div className="mt-2">
            <label className="block text-xs text-gray-500">Remarks</label>
            <input
              type="text"
              value={extendForm.extnRemarks}
              onChange={(e) => setExtendForm((f) => ({ ...f, extnRemarks: e.target.value }))}
              className="mt-0.5 w-full rounded border border-gray-300 px-2 py-1 text-xs"
            />
          </div>
          <div className="mt-2 flex gap-2">
            <button
              onClick={handleExtend}
              disabled={loading}
              className="inline-flex items-center gap-1 rounded bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
            >
              {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Extend Validity
            </button>
            <button
              onClick={() => setShowExtend(false)}
              className="rounded border border-gray-300 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-100"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
