'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';

const S = {
  container: { maxWidth: 720, margin: '0 auto', padding: '32px 16px', fontFamily: 'Inter, system-ui, sans-serif', color: 'var(--fg, #111)' } as React.CSSProperties,
  heading: { fontSize: 22, fontWeight: 700, marginBottom: 8 } as React.CSSProperties,
  sub: { fontSize: 14, color: 'var(--fg-muted, #6b7280)', marginBottom: 32 } as React.CSSProperties,
  section: { marginBottom: 20 } as React.CSSProperties,
  label: { display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6, color: 'var(--fg, #111)' } as React.CSSProperties,
  input: { width: '100%', padding: '8px 12px', border: '1px solid var(--border, #d1d5db)', borderRadius: 6, fontSize: 14, background: 'var(--bg-input, #fff)', color: 'var(--fg, #111)', boxSizing: 'border-box' } as React.CSSProperties,
  btn: { padding: '9px 20px', background: 'var(--accent, #2563eb)', color: '#fff', border: 'none', borderRadius: 6, fontSize: 14, fontWeight: 600, cursor: 'pointer' } as React.CSSProperties,
  alert: (ok: boolean) => ({ padding: '10px 14px', borderRadius: 6, fontSize: 13, marginBottom: 16, background: ok ? '#d1fae5' : '#fee2e2', color: ok ? '#065f46' : '#991b1b' }) as React.CSSProperties,
  divider: { borderTop: '1px solid var(--border, #e5e7eb)', margin: '28px 0' } as React.CSSProperties,
  hint: { fontSize: 12, color: 'var(--fg-muted, #6b7280)', marginTop: 4 } as React.CSSProperties,
};

interface WAConfigForm {
  phoneNumberId: string;
  accessToken: string;
  verifyToken: string;
}

const defaultConfig: WAConfigForm = { phoneNumberId: '', accessToken: '', verifyToken: '' };

export default function WhatsAppIntegrationPage() {
  const { appId } = useParams<{ appId: string }>();
  const [config, setConfig] = useState<WAConfigForm>(defaultConfig);
  const [status, setStatus] = useState<{ ok: boolean; msg: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testTo, setTestTo] = useState('');
  const [testTemplate, setTestTemplate] = useState('');
  const [testLang, setTestLang] = useState('en_US');

  const loadConfig = useCallback(async () => {
    const res = await fetch(`/api/builder/apps/${appId}/integrations/whatsapp`);
    if (!res.ok) return;
    const data = (await res.json()) as { config: Partial<WAConfigForm> | null };
    if (data.config) {
      setConfig((prev) => ({
        ...prev,
        phoneNumberId: data.config?.phoneNumberId ?? prev.phoneNumberId,
        verifyToken: data.config?.verifyToken ?? prev.verifyToken,
      }));
    }
  }, [appId]);

  useEffect(() => { void loadConfig(); }, [loadConfig]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true); setStatus(null);
    try {
      const res = await fetch(`/api/builder/apps/${appId}/integrations/whatsapp`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(config) });
      if (res.ok) { setStatus({ ok: true, msg: 'WhatsApp config saved.' }); await loadConfig(); }
      else { const e2 = (await res.json()) as { error: unknown }; setStatus({ ok: false, msg: JSON.stringify(e2.error) }); }
    } catch (err) { setStatus({ ok: false, msg: String(err) }); }
    finally { setSaving(false); }
  };

  const handleTest = async () => {
    if (!testTo || !testTemplate) return; setTesting(true); setStatus(null);
    try {
      const res = await fetch(`/api/runtime/novo/whatsapp/send`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ appId, to: testTo, templateName: testTemplate, languageCode: testLang }) });
      if (res.ok) { const d = (await res.json()) as { messageId: string }; setStatus({ ok: true, msg: `Message sent! ID: ${d.messageId}` }); }
      else { const e2 = (await res.json()) as { error: unknown }; setStatus({ ok: false, msg: `Test failed: ${JSON.stringify(e2.error)}` }); }
    } catch (err) { setStatus({ ok: false, msg: String(err) }); }
    finally { setTesting(false); }
  };

  const setField = (key: keyof WAConfigForm) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setConfig((c) => ({ ...c, [key]: e.target.value }));

  const webhookUrl = typeof window !== 'undefined' ? `${window.location.origin}/api/webhooks/whatsapp` : '/api/webhooks/whatsapp';

  return (
    <div style={S.container}>
      <h1 style={S.heading}>WhatsApp Integration</h1>
      <p style={S.sub}>Connect Meta Cloud API to send WhatsApp template messages from your app.</p>
      {status && <div style={S.alert(status.ok)}>{status.msg}</div>}
      <form onSubmit={(e) => { void handleSave(e); }}>
        <div style={S.section}>
          <label style={S.label}>Phone Number ID</label>
          <input style={S.input} value={config.phoneNumberId} placeholder="123456789012345" onChange={setField('phoneNumberId')} required />
          <p style={S.hint}>Found in Meta Developer Console → WhatsApp → API Setup.</p>
        </div>
        <div style={S.section}>
          <label style={S.label}>Permanent Access Token</label>
          <input type="password" style={S.input} value={config.accessToken} placeholder="EAA..." onChange={setField('accessToken')} required />
          <p style={S.hint}>Create a System User token in Meta Business Manager with WhatsApp message permissions.</p>
        </div>
        <div style={S.section}>
          <label style={S.label}>Webhook Verify Token</label>
          <input style={S.input} value={config.verifyToken} placeholder="my-verify-token" onChange={setField('verifyToken')} required />
          <p style={S.hint}>Register your webhook at: <code>{webhookUrl}</code></p>
        </div>
        <button type="submit" style={S.btn} disabled={saving}>{saving ? 'Saving…' : 'Save Config'}</button>
      </form>

      <div style={S.divider} />
      <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>Test Send</h2>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' as const }}>
        <div style={{ flex: 2 }}><label style={S.label}>Phone (E.164)</label><input style={S.input} value={testTo} placeholder="+919876543210" onChange={(e) => setTestTo(e.target.value)} /></div>
        <div style={{ flex: 2 }}><label style={S.label}>Template name</label><input style={S.input} value={testTemplate} placeholder="hello_world" onChange={(e) => setTestTemplate(e.target.value)} /></div>
        <div style={{ flex: 1 }}><label style={S.label}>Language</label><input style={S.input} value={testLang} placeholder="en_US" onChange={(e) => setTestLang(e.target.value)} /></div>
      </div>
      <div style={{ marginTop: 12 }}>
        <button style={S.btn} onClick={() => { void handleTest(); }} disabled={testing || !testTo || !testTemplate} type="button">{testing ? 'Sending…' : 'Send Test'}</button>
      </div>

      <div style={S.divider} />
      <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>Templates</h2>
      <p style={{ fontSize: 13, color: 'var(--fg-muted, #6b7280)' }}>
        WhatsApp templates are created and approved in Meta Business Manager. Enter an approved template name above to verify connectivity.
      </p>
    </div>
  );
}
