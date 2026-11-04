'use client';

import { useEffect } from 'react';

export default function FormBuilderError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[FormBuilderError]', error);
  }, [error]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', padding: '2rem', fontFamily: 'sans-serif' }}>
      <h2 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '0.5rem' }}>Form Builder Error</h2>
      <p style={{ color: '#666', marginBottom: '1.5rem', textAlign: 'center', maxWidth: '28rem' }}>
        {error.message || 'An error occurred in the form builder. Your changes may not have been saved.'}
      </p>
      <button
        onClick={reset}
        style={{ padding: '0.5rem 1.25rem', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '0.375rem', cursor: 'pointer', fontSize: '0.875rem' }}
      >
        Try again
      </button>
    </div>
  );
}
