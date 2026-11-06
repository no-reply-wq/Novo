'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import type { EmailProvider } from '@/platform/integrations/email/types';

const S = {
  container: { maxWidth: 720, margin: '0 auto', padding: '32px 16px', fontFamily: 'Inter, system-ui, sans-serif', color: 'var(--fg, #111)' } as React.CSSProperties,
  heading: { fontSize: 22, fontWeight: 700, marginBottom: 8 } as React.CSSProperties,
  sub: { fontSize: 14, color: 'var(--fg-muted, #6b7280)', marginBottom: 32 } as React.CSSProperties,
  section: { marginBottom: 20 } as React.CSSProperties,
  label: { display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6, color: 'var(--fg, #111)' } as React.CSSProperties,
  input: { width: '100%', padding: '8px 12px', border: '1px solid var(--border, #d1d5db)', borderRadius: 6, fontSize: 14, background: 'var(--bg-input, #fff)', color: 'var(--fg, #111)', boxSizing: 'border-box' } as React.CSSProperties,
  select: { width: '100%', padding: '8px 12px', border: '1px solid var(--border, #d1d5db)', borderRadius: 6, fontSize: 14, background: 'var(--bg-input, #fff)', color: 'var(--fg, #111)', boxSizing: 'border-box' } as React.CSSProperties,
  row: { display: 'flex', gap: 12, marginBottom: 0 } as React.CSSProperties,
  col: { flex: 1 } as React.CSSProperties,
  btn: { padding: '9px 20px', background: 'var(--accent, #2563eb)', color: '#fff', border: 'none', borderRadius: 6, fontSize: 14, fontWeight: 600, cursor: 'pointer' } as React.CSSProperties,
  btnSec: { padding: '9px 20px', background: 'transparent', color: 'var(--accent, #2563eb)', border: '1px solid var(--accent, #2563eb)', borderRadius: 6, fontSize: 14, fontWeight: 600, cursor: 'pointer' } as React.CSSProperties,
  alert: (ok: boolean) => ({ padding: '10px 14px', borderRadius: 6, fontSize: 13, marginBottom: 16, background: ok ? '#d1fae5' : '#fee2e2', color: ok ? '#065f46' : '#991b1b' }) as React.CSSProperties,
  divider: { borderTop: '1px solid var(--border, #e5e7eb)', margin: '28px 0' } as React.CSSProperties,
  card: { border: '1px solid var(--border, #e5e7eb)', borderRadius: 8, padding: '14px 16px', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 12 } as React.CSSProperties,
};

interface EmailConfigForm {
  provider: EmailProvider;
  fromAddress: string;
  fromName: string;
  smtpHost: string;
  smtpPort: string;
  smtpSecure: boolean;
  smtpUser: string;
  smtpPass: string;
  sesRegion: string;
  sesAccessKeyId: string;
  sesSecretAccessKey: string;
  resendApiKey: string;
}

interface TemplateRow { id: string; name: string; subject: string; }
interface TemplateForm { name: string; subject: string; bodyHtml: string; bodyText: string; }

const defaultConfig: EmailConfigForm = {
  provider: 'smtp', fromAddress: '', fromName: '',
  smtpHost: '', smtpPort: '587', smtpSecure: false, smtpUser: '', smtpPass: '',
  sesRegion: 'us-east-1', sesAccessKeyId: '', sesSecretAccessKey: '', resendApiKey: '',
};
const defaultTpl: TemplateForm = { name: '', subject: '', bodyHtml: '', bodyText: '' };

export default function EmailIntegrationPage() {
  const { appId } = useParams<{ appId: string }>();
  const [config, setConfig] = useState<EmailConfigForm>(defaultConfig);
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [status, setStatus] = useState<{ ok: boolean; msg: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testTo, setTestTo] = useState('');
  const [showTplForm, setShowTplForm] = useState(false);
  const [tplForm, setTplForm] = useState<TemplateForm>(defaultTpl);
  const [tplSaving, setTplSaving] = useState(false);

  const loadConfig = useCallback(async () => {
    const res = await fetch(`/api/builder/apps/${appId}/integrations/email`);
    if (!res.ok) return;
    const data = (await res.json()) as { config: Partial<EmailConfigForm> | null };
    if (data.config) setConfig((prev) => ({ ...prev, ...data.config }));
  }, [appId]);

  const loadTemplates = useCallback(async () => {
    const res = await fetch(`/api/builder/apps/${appId}/email-templates`);
    if (!res.ok) return;
    const data = (await res.json()) as { templates: TemplateRow[] };
    setTemplates(data.templates);
  }, [appId]);

  useEffect(() => { void loadConfig(); void loadTemplates(); }, [loadConfig, loadTemplates]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true); setStatus(null);
    try {
      const payload: Record<string, unknown> = { provider: config.provider, fromAddress: config.fromAddress, fromName: config.fromName };
      if (config.provider === 'smtp') Object.assign(payload, { smtpHost: config.smtpHost, smtpPort: parseInt(config.smtpPort, 10), smtpSecure: config.smtpSecure, smtpUser: config.smtpUser || undefined, smtpPass: config.smtpPass || undefined });
      else if (config.provider === 'ses') Object.assign(payload, { sesRegion: config.sesRegion, sesAccessKeyId: config.sesAccessKeyId, sesSecretAccessKey: config.sesSecretAccessKey || undefined });
      else payload['resendApiKey'] = config.resendApiKey || undefined;

      const res = await fetch(`/api/builder/apps/${appId}/integrations/email`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (res.ok) setStatus({ ok: true, msg: 'Email config saved.' });
      else { const e2 = (await res.json()) as { error: unknown }; setStatus({ ok: false, msg: JSON.stringify(e2.error) }); }
    } catch (err) { setStatus({ ok: false, msg: String(err) }); }
    finally { setSaving(false); }
  };

  const handleTest = async () => {
    if (!testTo) return; setTesting(true); setStatus(null);
    try {
      const res = await fetch(`/api/runtime/novo/email/send`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ appId, to: testTo, subject: 'Test email from Novo', bodyHtml: '<p>This is a test email from your Novo Email integration.</p>' }) });
      if (res.ok) setStatus({ ok: true, msg: `Test email sent to ${testTo}` });
      else { const e2 = (await res.json()) as { error: unknown }; setStatus({ ok: false, msg: `Test failed: ${JSON.stringify(e2.error)}` }); }
    } catch (err) { setStatus({ ok: false, msg: String(err) }); }
    finally { setTesting(false); }
  };

  const handleSaveTpl = async (e: React.FormEvent) => {
    e.preventDefault(); setTplSaving(true);
    try {
      const res = await fetch(`/api/builder/apps/${appId}/email-templates`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: tplForm.name, subject: tplForm.subject, bodyHtml: tplForm.bodyHtml, bodyText: tplForm.bodyText || undefined }) });
      if (res.ok) { setShowTplForm(false); setTplForm(defaultTpl); await loadTemplates(); }
    } finally { setTplSaving(false); }
  };

  const deleteTpl = async (id: string) => { await fetch(`/api/builder/apps/${appId}/email-templates/${id}`, { method: 'DELETE' }); await loadTemplates(); };

  const inp = (label: string, key: keyof EmailConfigForm, type = 'text', ph = '') => (
    <div style={S.section}>
      <label style={S.label}>{label}</label>
      <input type={type} style={S.input} value={config[key] as string} placeholder={ph} onChange={(e) => setConfig((c) => ({ ...c, [key]: e.target.value }))} />
    </div>
  );

  return (
    <div style={S.container}>
      <h1 style={S.heading}>Email Integration</h1>
      <p style={S.sub}>Configure SMTP, AWS SES, or Resend to send emails from your app.</p>
      {status && <div style={S.alert(status.ok)}>{status.msg}</div>}
      <form onSubmit={(e) => { void handleSave(e); }}>
        <div style={S.section}>
          <label style={S.label}>Provider</label>
          <select style={S.select} value={config.provider} onChange={(e) => setConfig((c) => ({ ...c, provider: e.target.value as EmailProvider }))}>
            <option value="smtp">SMTP</option>
            <option value="ses">AWS SES</option>
            <option value="resend">Resend</option>
          </select>
        </div>
        <div style={S.row}>
          <div style={S.col}>{inp('From Address', 'fromAddress', 'email', 'noreply@example.com')}</div>
          <div style={S.col}>{inp('From Name', 'fromName', 'text', 'My App')}</div>
        </div>
        {config.provider === 'smtp' && (<>
          <div style={S.row}>
            <div style={{ flex: 2 }}>{inp('SMTP Host', 'smtpHost', 'text', 'smtp.example.com')}</div>
            <div style={{ flex: 1 }}>{inp('Port', 'smtpPort', 'number', '587')}</div>
          </div>
          {inp('Username', 'smtpUser', 'text', 'user@example.com')}
          {inp('Password', 'smtpPass', 'password', '••••••••')}
          <div style={S.section}>
            <label style={S.label}><input type="checkbox" checked={config.smtpSecure} onChange={(e) => setConfig((c) => ({ ...c, smtpSecure: e.target.checked }))} style={{ marginRight: 8 }} />Use TLS (port 465)</label>
          </div>
        </>)}
        {config.provider === 'ses' && (<>
          {inp('AWS Region', 'sesRegion', 'text', 'us-east-1')}
          {inp('Access Key ID', 'sesAccessKeyId', 'text', 'AKIA...')}
          {inp('Secret Access Key', 'sesSecretAccessKey', 'password', '••••••••')}
        </>)}
        {config.provider === 'resend' && inp('Resend API Key', 'resendApiKey', 'password', 're_...')}
        <button type="submit" style={S.btn} disabled={saving}>{saving ? 'Saving…' : 'Save Config'}</button>
      </form>

      <div style={S.divider} />
      <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>Test Send</h2>
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
        <div style={{ flex: 1 }}>
          <label style={S.label}>Send test to</label>
          <input type="email" style={S.input} value={testTo} placeholder="you@example.com" onChange={(e) => setTestTo(e.target.value)} />
        </div>
        <button style={S.btn} onClick={() => { void handleTest(); }} disabled={testing || !testTo} type="button">{testing ? 'Sending…' : 'Send Test'}</button>
      </div>

      <div style={S.divider} />
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, flex: 1, margin: 0 }}>Email Templates</h2>
        <button style={S.btnSec} onClick={() => setShowTplForm((s) => !s)} type="button">{showTplForm ? 'Cancel' : '+ New Template'}</button>
      </div>
      {showTplForm && (
        <form onSubmit={(e) => { void handleSaveTpl(e); }} style={{ marginBottom: 24 }}>
          <div style={S.section}><label style={S.label}>Template Name</label><input style={S.input} value={tplForm.name} placeholder="order_confirmation" onChange={(e) => setTplForm((f) => ({ ...f, name: e.target.value }))} required /></div>
          <div style={S.section}><label style={S.label}>Subject (supports {'{{ expr }}'})</label><input style={S.input} value={tplForm.subject} placeholder="Your order #{{ order.number }} is ready" onChange={(e) => setTplForm((f) => ({ ...f, subject: e.target.value }))} required /></div>
          <div style={S.section}><label style={S.label}>HTML Body</label><textarea style={{ ...S.input, minHeight: 120, resize: 'vertical' }} value={tplForm.bodyHtml} placeholder={'<p>Hi {{ customer.name }}</p>'} onChange={(e) => setTplForm((f) => ({ ...f, bodyHtml: e.target.value }))} required /></div>
          <div style={S.section}><label style={S.label}>Plain Text (optional)</label><textarea style={{ ...S.input, minHeight: 60, resize: 'vertical' }} value={tplForm.bodyText} onChange={(e) => setTplForm((f) => ({ ...f, bodyText: e.target.value }))} /></div>
          <button type="submit" style={S.btn} disabled={tplSaving}>{tplSaving ? 'Saving…' : 'Save Template'}</button>
        </form>
      )}
      {templates.length === 0 && <p style={{ fontSize: 13, color: 'var(--fg-muted, #6b7280)' }}>No templates yet.</p>}
      {templates.map((tpl) => (
        <div key={tpl.id} style={S.card}>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, fontSize: 14 }}>{tpl.name}</div>
            <div style={{ fontSize: 12, color: 'var(--fg-muted, #6b7280)' }}>{tpl.subject}</div>
          </div>
          <button style={S.btnSec} onClick={() => { void deleteTpl(tpl.id); }} type="button">Delete</button>
        </div>
      ))}
    </div>
  );
}
