'use client';

/**
 * Builder page: E-Way Bill integration configuration wizard.
 * 4 steps: Credentials → Select Table → Field Mapping → Done
 */

import React, { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { CheckCircle, ChevronRight, Loader2 } from 'lucide-react';

interface TableOption {
  id: string;
  name: string;
}

interface Step1 {
  gstin: string;
  username: string;
  password: string;
  sandbox: boolean;
}

interface Step3 {
  documentNumber: string;
  documentDate: string;
  fromGstin: string;
  fromName: string;
  fromAddress: string;
  fromCity: string;
  fromPincode: string;
  fromStateCode: string;
  toGstin: string;
  toName: string;
  toAddress: string;
  toCity: string;
  toPincode: string;
  toStateCode: string;
  transportMode: string;
  vehicleNumber: string;
  distance: string;
  itemsTableId: string;
  itemName: string;
  itemHsn: string;
  itemQty: string;
  itemUnit: string;
  itemTaxableAmount: string;
  itemGstRate: string;
}

const FIELD_MAPPING_LABELS: Record<keyof Step3, string> = {
  documentNumber: 'Document Number',
  documentDate: 'Document Date',
  fromGstin: 'From GSTIN',
  fromName: 'From Trade Name',
  fromAddress: 'From Address',
  fromCity: 'From City/Place',
  fromPincode: 'From Pincode',
  fromStateCode: 'From State Code',
  toGstin: 'To GSTIN',
  toName: 'To Trade Name',
  toAddress: 'To Address',
  toCity: 'To City/Place',
  toPincode: 'To Pincode',
  toStateCode: 'To State Code',
  transportMode: 'Transport Mode',
  vehicleNumber: 'Vehicle Number',
  distance: 'Distance (km)',
  itemsTableId: 'Line Items Table ID',
  itemName: 'Item Name Field',
  itemHsn: 'Item HSN Code Field',
  itemQty: 'Item Quantity Field',
  itemUnit: 'Item Unit Field',
  itemTaxableAmount: 'Item Taxable Amount Field',
  itemGstRate: 'Item GST Rate Field',
};

const EMPTY_MAPPING: Step3 = Object.fromEntries(
  Object.keys(FIELD_MAPPING_LABELS).map((k) => [k, ''])
) as unknown as Step3;

export default function EWayBillConfigPage() {
  const params = useParams();
  const appId = typeof params['appId'] === 'string' ? params['appId'] : '';

  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [tables, setTables] = useState<TableOption[]>([]);

  const [credentials, setCredentials] = useState<Step1>({
    gstin: '',
    username: '',
    password: '',
    sandbox: true,
  });

  const [selectedTableId, setSelectedTableId] = useState('');
  const [fieldMapping, setFieldMapping] = useState<Step3>(EMPTY_MAPPING);

  // Load tables for step 2
  useEffect(() => {
    if (step !== 2) return;
    const load = async () => {
      try {
        const res = await fetch(`/api/builder/apps/${appId}/tables`);
        if (res.ok) {
          const data = (await res.json()) as { tables?: TableOption[] };
          setTables(data.tables ?? []);
        }
      } catch {
        // non-fatal
      }
    };
    void load();
  }, [step, appId]);

  async function handleTestAndSave() {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/builder/integrations/ewaybill/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantSlug: '', // resolved server-side from session
          appId,
          tableId: selectedTableId,
          config: credentials,
          fieldMapping,
          testConnection: true,
        }),
      });
      const data = (await res.json()) as { success?: boolean; error?: string };
      if (!res.ok || !data.success) {
        setError(data.error ?? 'Save failed');
        return;
      }
      setSuccess(true);
      setStep(5);
    } catch {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  }

  const stepLabels = ['Credentials', 'Select Table', 'Field Mapping', 'Test & Save'];

  return (
    <div className="mx-auto max-w-2xl p-6">
      <h1 className="mb-1 text-xl font-semibold text-gray-900">E-Way Bill Integration</h1>
      <p className="mb-6 text-sm text-gray-500">
        Configure once — staff click a button to generate, cancel, or extend E-Way Bills.
      </p>

      {/* Step indicators */}
      <div className="mb-8 flex items-center gap-2">
        {stepLabels.map((label, i) => {
          const n = i + 1;
          const done = step > n;
          const active = step === n;
          return (
            <React.Fragment key={label}>
              <div className="flex flex-col items-center gap-1">
                <div
                  className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-medium ${
                    done
                      ? 'bg-green-500 text-white'
                      : active
                      ? 'bg-indigo-600 text-white'
                      : 'bg-gray-200 text-gray-500'
                  }`}
                >
                  {done ? <CheckCircle className="h-4 w-4" /> : n}
                </div>
                <span className="text-xs text-gray-500">{label}</span>
              </div>
              {i < stepLabels.length - 1 && (
                <ChevronRight className="h-4 w-4 flex-shrink-0 text-gray-300" />
              )}
            </React.Fragment>
          );
        })}
      </div>

      {error && (
        <div className="mb-4 rounded bg-red-50 px-4 py-2 text-sm text-red-700">{error}</div>
      )}

      {/* Step 1: Credentials */}
      {step === 1 && (
        <div className="space-y-4">
          <h2 className="font-medium text-gray-800">NIC Portal Credentials</h2>
          <div>
            <label className="block text-sm font-medium text-gray-700">GSTIN</label>
            <input
              type="text"
              value={credentials.gstin}
              onChange={(e) => setCredentials((c) => ({ ...c, gstin: e.target.value }))}
              placeholder="22AAAAA0000A1Z5"
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Username</label>
            <input
              type="text"
              value={credentials.username}
              onChange={(e) => setCredentials((c) => ({ ...c, username: e.target.value }))}
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Password</label>
            <input
              type="password"
              value={credentials.password}
              onChange={(e) => setCredentials((c) => ({ ...c, password: e.target.value }))}
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div className="flex items-center gap-2">
            <input
              id="sandbox"
              type="checkbox"
              checked={credentials.sandbox}
              onChange={(e) => setCredentials((c) => ({ ...c, sandbox: e.target.checked }))}
              className="h-4 w-4 rounded border-gray-300 text-indigo-600"
            />
            <label htmlFor="sandbox" className="text-sm text-gray-700">
              Use Sandbox (testing)
            </label>
          </div>
          <button
            onClick={() => setStep(2)}
            disabled={!credentials.gstin || !credentials.username || !credentials.password}
            className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            Next
          </button>
        </div>
      )}

      {/* Step 2: Select table */}
      {step === 2 && (
        <div className="space-y-4">
          <h2 className="font-medium text-gray-800">Which table generates E-Way Bills?</h2>
          <p className="text-sm text-gray-500">
            Typically your Deliveries or Orders table.
          </p>
          <div className="space-y-2">
            {tables.length === 0 && (
              <p className="text-sm text-gray-400">Loading tables…</p>
            )}
            {tables.map((t) => (
              <label
                key={t.id}
                className={`flex cursor-pointer items-center gap-3 rounded-md border px-4 py-3 ${
                  selectedTableId === t.id
                    ? 'border-indigo-500 bg-indigo-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <input
                  type="radio"
                  name="table"
                  value={t.id}
                  checked={selectedTableId === t.id}
                  onChange={() => setSelectedTableId(t.id)}
                  className="text-indigo-600"
                />
                <span className="text-sm font-medium text-gray-800">{t.name}</span>
              </label>
            ))}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setStep(1)}
              className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              Back
            </button>
            <button
              onClick={() => setStep(3)}
              disabled={!selectedTableId}
              className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Field mapping */}
      {step === 3 && (
        <div className="space-y-4">
          <h2 className="font-medium text-gray-800">Map fields to E-Way Bill attributes</h2>
          <p className="text-sm text-gray-500">
            Enter the column name in your table that maps to each EWB field.
          </p>
          <div className="space-y-2">
            {(Object.entries(FIELD_MAPPING_LABELS) as [keyof Step3, string][]).map(([key, label]) => (
              <div key={key} className="flex items-center gap-3">
                <label className="w-48 flex-shrink-0 text-xs text-gray-600">{label}</label>
                <input
                  type="text"
                  value={fieldMapping[key]}
                  onChange={(e) =>
                    setFieldMapping((m) => ({ ...m, [key]: e.target.value }))
                  }
                  placeholder="column_name"
                  className="flex-1 rounded border border-gray-300 px-2 py-1 text-xs"
                />
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setStep(2)}
              className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              Back
            </button>
            <button
              onClick={() => setStep(4)}
              className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* Step 4: Test & Save */}
      {step === 4 && (
        <div className="space-y-4">
          <h2 className="font-medium text-gray-800">Test Connection & Save</h2>
          <p className="text-sm text-gray-500">
            Click below to verify your credentials against the NIC portal and save the
            configuration.
          </p>
          <div className="rounded-md bg-gray-50 px-4 py-3 text-sm">
            <p><span className="font-medium">GSTIN:</span> {credentials.gstin}</p>
            <p><span className="font-medium">Environment:</span> {credentials.sandbox ? 'Sandbox' : 'Production'}</p>
            <p><span className="font-medium">Table ID:</span> {selectedTableId}</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setStep(3)}
              className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              Back
            </button>
            <button
              onClick={handleTestAndSave}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              Test Connection & Save
            </button>
          </div>
        </div>
      )}

      {/* Step 5: Done */}
      {step === 5 && success && (
        <div className="rounded-md bg-green-50 px-6 py-8 text-center">
          <CheckCircle className="mx-auto mb-3 h-10 w-10 text-green-500" />
          <h2 className="text-lg font-medium text-green-800">E-Way Bill integration configured!</h2>
          <p className="mt-1 text-sm text-green-700">
            Staff can now generate E-Way Bills directly from the {selectedTableId} table.
          </p>
        </div>
      )}
    </div>
  );
}
