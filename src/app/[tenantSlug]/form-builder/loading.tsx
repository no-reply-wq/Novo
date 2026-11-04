export default function FormBuilderLoading() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ width: '1.75rem', height: '1.75rem', border: '3px solid #e5e7eb', borderTopColor: '#2563eb', borderRadius: '50%', animation: 'spin 0.75s linear infinite', margin: '0 auto 0.75rem' }} />
        <p style={{ color: '#9ca3af', fontSize: '0.875rem' }}>Loading form builder…</p>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
