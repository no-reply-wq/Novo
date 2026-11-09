'use client';

import React, { useState } from 'react';
import type { TDSCalculationResult } from '@/platform/integrations/tds/calculator';

export interface TDSCalculatorWidgetProps {
  tenantSlug: string;
  appId: string;
  paymentRecordId: string;
  vendorId: string;
  amount: number;
  onCalculated?: (result: TDSCalculationResult) => void;
}

type State =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'done'; result: TDSCalculationResult }
  | { status: 'error'; message: string };

const fmtINR = (n: number) =>
  `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function TDSCalculatorWidget({
  tenantSlug,
  appId,
  paymentRecordId,
  vendorId,
  amount,
  onCalculated,
}: TDSCalculatorWidgetProps) {
  const [state, setState] = useState<State>({ status: 'idle' });
  const [applied, setApplied] = useState(false);

  const calculate = async () => {
    setState({ status: 'loading' });
    try {
      const res = await fetch('/api/runtime/tds/calculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantSlug, appId, paymentRecordId, vendorId, amount }),
      });
      const data: TDSCalculationResult & { error?: string } = await res.json();
      if (!res.ok) {
        setState({ status: 'error', message: data.error ?? 'Calculation failed.' });
        return;
      }
      setState({ status: 'done', result: data });
      setApplied(true);
      onCalculated?.(data);
    } catch {
      setState({ status: 'error', message: 'Network error. Please try again.' });
    }
  };

  const noPANWarning =
    state.status === 'done' &&
    state.result.tdsRate >= 20 &&
    !state.result.thresholdApplied;

  return (
    <div
      style={{
        border: '1px solid var(--border, #e5e7eb)',
        borderRadius: 8,
        padding: 16,
        background: 'var(--surface, #fff)',
        fontFamily: 'Inter, system-ui, sans-serif',
        maxWidth: 380,
      }}
    >
      <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 12 }}>TDS Calculator</div>

      {/* Gross amount */}
      <Row label="Gross Amount" value={fmtINR(amount)} />

      {state.status === 'done' && (
        <>
          {noPANWarning && (
            <div
              style={{
                background: '#fffbeb',
                border: '1px solid #fcd34d',
                borderRadius: 6,
                padding: '8px 10px',
                fontSize: 12,
                color: '#92400e',
                marginBottom: 10,
              }}
            >
              Warning: Vendor PAN not provided. Higher TDS rate ({state.result.tdsRate}%) applied under section 206AA.
            </div>
          )}
          <Row label={`TDS Section ${state.result.section} @ ${state.result.tdsRate}%`} value={fmtINR(state.result.tdsAmount)} highlight />
          <Row label="Net Payable" value={fmtINR(state.result.netAmount)} bold />
          <div
            style={{
              fontSize: 12,
              color: 'var(--fg-muted, #6b7280)',
              marginTop: 8,
              marginBottom: 4,
            }}
          >
            {state.result.reason}
          </div>
          {state.result.thresholdApplied && (
            <div
              style={{
                fontSize: 12,
                color: '#065f46',
                background: '#d1fae5',
                borderRadius: 4,
                padding: '4px 8px',
                display: 'inline-block',
                marginBottom: 8,
              }}
            >
              Below threshold — no TDS deducted
            </div>
          )}
        </>
      )}

      {state.status === 'error' && (
        <div
          style={{
            fontSize: 13,
            color: '#991b1b',
            background: '#fee2e2',
            borderRadius: 6,
            padding: '8px 10px',
            marginBottom: 8,
          }}
        >
          {state.message}
        </div>
      )}

      <div style={{ marginTop: 12 }}>
        {applied ? (
          <span style={{ fontSize: 13, color: '#065f46', fontWeight: 500 }}>TDS applied to payment record</span>
        ) : (
          <button
            onClick={calculate}
            disabled={state.status === 'loading'}
            style={{
              padding: '8px 16px',
              background: 'var(--accent, #6366f1)',
              color: '#fff',
              border: 'none',
              borderRadius: 6,
              fontWeight: 600,
              fontSize: 13,
              cursor: state.status === 'loading' ? 'default' : 'pointer',
              opacity: state.status === 'loading' ? 0.7 : 1,
            }}
          >
            {state.status === 'loading' ? 'Calculating…' : 'Calculate & Apply TDS'}
          </button>
        )}
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  highlight = false,
  bold = false,
}: {
  label: string;
  value: string;
  highlight?: boolean;
  bold?: boolean;
}) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        fontSize: 13,
        padding: '5px 0',
        borderBottom: '1px solid var(--border, #f3f4f6)',
        color: highlight ? '#dc2626' : 'var(--fg, #374151)',
        fontWeight: bold || highlight ? 600 : 400,
      }}
    >
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}
