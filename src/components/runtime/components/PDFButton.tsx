'use client';

import React, { useState, useCallback } from 'react';

export interface PDFButtonProps {
  templateId: string;
  recordId: string;
  tenantSlug: string;
  label?: string;
}

interface GenerateResponse {
  error?: string;
}

const S = {
  btn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '7px 16px',
    background: '#7c3aed',
    color: '#fff',
    border: 'none',
    borderRadius: 6,
    fontSize: 13,
    fontWeight: 500,
    cursor: 'pointer',
  } as React.CSSProperties,
  btnDisabled: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '7px 16px',
    background: '#a78bfa',
    color: '#fff',
    border: 'none',
    borderRadius: 6,
    fontSize: 13,
    fontWeight: 500,
    cursor: 'not-allowed',
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
  errorToast: {
    position: 'fixed',
    bottom: 24,
    right: 24,
    background: '#dc2626',
    color: '#fff',
    padding: '10px 16px',
    borderRadius: 8,
    fontSize: 13,
    zIndex: 99999,
    maxWidth: 320,
    boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
  } as React.CSSProperties,
};

export function PDFButton({ templateId, recordId, tenantSlug, label = 'Download PDF' }: PDFButtonProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDownload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/runtime/${tenantSlug}/pdf/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          templateId,
          recordId,
          tableId: 'unknown',
        }),
      });

      if (!res.ok) {
        const data = (await res.json()) as GenerateResponse;
        throw new Error(data.error ?? 'PDF generation failed');
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `document-${recordId}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Download failed';
      setError(msg);
      setTimeout(() => setError(null), 5000);
    } finally {
      setLoading(false);
    }
  }, [templateId, recordId, tenantSlug]);

  return (
    <>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <button
        style={loading ? S.btnDisabled : S.btn}
        onClick={() => void handleDownload()}
        disabled={loading}
        title={`Download PDF for record ${recordId}`}
      >
        {loading ? (
          <>
            <span style={S.spinner} />
            Generating…
          </>
        ) : (
          <>
            📄 {label}
          </>
        )}
      </button>
      {error && (
        <div style={S.errorToast} role="alert">
          ✕ {error}
        </div>
      )}
    </>
  );
}
