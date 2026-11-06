'use client';

import React, { useState, useCallback } from 'react';

export interface EInvoiceButtonProps {
  tenantSlug: string;
  tableId: string;
  recordId: string;
  currentIrn?: string;
  currentStatus?: string;
}

interface EInvoiceApiResponse {
  irn?: string;
  ackNo?: string;
  ackDt?: string;
  signedQrCode?: string;
  error?: string;
}

const S = {
  wrapper: { display: 'inline-flex', alignItems: 'center', gap: 8 } as React.CSSProperties,
  btnGenerate: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '7px 16px',
    background: '#2563eb',
    color: '#fff',
    border: 'none',
    borderRadius: 6,
    fontSize: 13,
    fontWeight: 500,
    cursor: 'pointer',
  } as React.CSSProperties,
  btnCancel: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '5px 12px',
    background: 'transparent',
    color: '#6b7280',
    border: '1px solid #e5e7eb',
    borderRadius: 6,
    fontSize: 12,
    cursor: 'pointer',
  } as React.CSSProperties,
  btnQr: {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '5px 10px',
    background: 'transparent',
    border: '1px solid #e5e7eb',
    borderRadius: 6,
    fontSize: 12,
    cursor: 'pointer',
  } as React.CSSProperties,
  badgeGreen: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '5px 12px',
    background: '#dcfce7',
    color: '#166534',
    borderRadius: 20,
    fontSize: 12,
    fontWeight: 600,
  } as React.CSSProperties,
  badgeRed: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '5px 12px',
    background: '#fef2f2',
    color: '#dc2626',
    borderRadius: 20,
    fontSize: 12,
    fontWeight: 500,
  } as React.CSSProperties,
  spinner: {
    display: 'inline-block',
    width: 14,
    height: 14,
    border: '2px solid rgba(255,255,255,0.3)',
    borderTop: '2px solid #fff',
    borderRadius: '50%',
    animation: 'spin 0.7s linear infinite',
  } as React.CSSProperties,
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
  } as React.CSSProperties,
  modal: {
    background: '#fff',
    borderRadius: 10,
    padding: 24,
    maxWidth: 400,
    width: '90%',
    textAlign: 'center',
  } as React.CSSProperties,
  modalTitle: { fontSize: 15, fontWeight: 600, marginBottom: 16 } as React.CSSProperties,
  qrImg: { maxWidth: '100%', borderRadius: 6, marginBottom: 16 } as React.CSSProperties,
  modalClose: {
    padding: '7px 20px',
    background: '#f3f4f6',
    border: 'none',
    borderRadius: 6,
    fontSize: 13,
    cursor: 'pointer',
  } as React.CSSProperties,
};

export function EInvoiceButton({
  tenantSlug,
  tableId,
  recordId,
  currentIrn,
  currentStatus,
}: EInvoiceButtonProps) {
  const [irn, setIrn] = useState<string | undefined>(currentIrn);
  const [status, setStatus] = useState<string>(currentStatus ?? (currentIrn ? 'generated' : 'pending'));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [qrCode, setQrCode] = useState<string | undefined>(undefined);
  const [showQr, setShowQr] = useState(false);

  const handleGenerate = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/runtime/einvoice/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantSlug, tableId, recordId }),
      });
      const data = (await res.json()) as EInvoiceApiResponse;
      if (!res.ok) {
        setError(data.error ?? 'Failed to generate IRN');
        setStatus('error');
      } else {
        setIrn(data.irn);
        setQrCode(data.signedQrCode);
        setStatus('generated');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
      setStatus('error');
    } finally {
      setLoading(false);
    }
  }, [tenantSlug, tableId, recordId]);

  const handleCancel = useCallback(async () => {
    if (!confirm('Cancel this IRN? This cannot be undone.')) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/runtime/einvoice/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantSlug, tableId, recordId, reason: 1, remarks: 'Cancelled by user' }),
      });
      const data = (await res.json()) as { cancelled?: boolean; error?: string };
      if (!res.ok) {
        setError(data.error ?? 'Cancel failed');
      } else {
        setStatus('cancelled');
        setIrn(undefined);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setLoading(false);
    }
  }, [tenantSlug, tableId, recordId]);

  if (loading) {
    return (
      <div style={S.wrapper}>
        <button style={S.btnGenerate} disabled>
          <span style={S.spinner} />
          {status === 'generated' ? 'Cancelling…' : 'Generating…'}
        </button>
      </div>
    );
  }

  if (status === 'generated' && irn) {
    return (
      <>
        <div style={S.wrapper}>
          <span style={S.badgeGreen}>
            ✓ IRN: {irn.slice(0, 12)}…
          </span>
          {qrCode && (
            <button style={S.btnQr} onClick={() => setShowQr(true)} title="View QR code">
              QR
            </button>
          )}
          <button style={S.btnCancel} onClick={handleCancel}>
            Cancel IRN
          </button>
        </div>
        {showQr && qrCode && (
          <div style={S.overlay} onClick={() => setShowQr(false)}>
            <div style={S.modal} onClick={(e) => e.stopPropagation()}>
              <div style={S.modalTitle}>Signed QR Code</div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`data:image/png;base64,${qrCode}`}
                alt="Signed QR Code"
                style={S.qrImg}
              />
              <button style={S.modalClose} onClick={() => setShowQr(false)}>
                Close
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  if (status === 'cancelled') {
    return (
      <div style={S.wrapper}>
        <span style={{ ...S.badgeRed, background: '#f3f4f6', color: '#6b7280' }}>
          Cancelled
        </span>
      </div>
    );
  }

  if (status === 'error' || error) {
    return (
      <div style={S.wrapper}>
        <span style={S.badgeRed} title={error ?? undefined}>
          ✕ Error{error ? `: ${error.slice(0, 40)}` : ''}
        </span>
        <button style={S.btnGenerate} onClick={handleGenerate}>
          Retry
        </button>
      </div>
    );
  }

  return (
    <div style={S.wrapper}>
      <button style={S.btnGenerate} onClick={handleGenerate}>
        Generate E-Invoice
      </button>
    </div>
  );
}
