'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import type { EmailProvider } from '@/platform/integrations/email/types';

// ─── Styles ───────────────────────────────────────────────────────────────────

const S = {
  container: {
    maxWidth: 720,
    margin: '0 auto',
    padding: '32px 16px',
    fontFamily: 'Inter, system-ui, sans-serif',
    color: 'var(--fg, #111)',
  } as React.CSSProperties,
  heading: { fontSize: 22, fontWeight: 700, marginBottom: 8 } as React.CSSProperties,
  sub: {
    fontSize: 14,
    color: 'var(--fg-muted, #6b7280)',
    marginBottom: 32,
  } as React.CSSProperties,
  section: { marginBottom: 28 } as React.CSSProperties,
  label: {
    display: 'block',
    fontSize: 13,
    fontWeight: 600,
    marginBottom: 6,
    color: 'var(--fg, #111)',
  } as React.CSSProperties,
  input: {
    width: '100%',
    padding: '8px 12px',
    border: '1px solid var(--border, #d1d5db)',
    borderRadius: 6,
    fontSize: 14,
    background: 'var(--bg-input, #fff)',
    color: 'var(--fg, #111)',
    boxSizing: 'border-box',
  } as React.CSSProperties,
  select: {
    width: '100%',
    padding: '8px 12px',
    border: '1px solid var(--border, #d1d5db)',
    borderRadius: 6,
    fontSize: 14,
    background: 'var(--bg-input, #fff)',
    color: 'var(--fg, #111)',
    boxSizing: 'border-box',
  } as React.CSSProperties,
  row: { display: 'flex', gap: 12, marginBottom: 16 } as React.CSSProperties,
  col: { flex: 1 } as React.CSSProperties,
  btn: {
    padding: '9px 20px',
    background: 'var(--accent, #2563eb)',
    color: '#fff',
    border: 'none',
    borderRadius: 6,
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
  } as React.CSSProperties,
  btnSecondary: {
    padding: '9px 20px',
    background: 'transparent',
    color: 'var(--accent, #2563eb)',
    border: '1px solid var(--accent, #2563eb)',
    borderRadius: 6,
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
    marginLeft: 8,
  } as React.CSSProperties,
  alert: (ok: boolean) =>
    ({
      padding: '10px 14px',
      borderRadius: 6,
      fontSize: 13,
      marginBottom: 16,
      background: ok ? '#d1fae5' : '#fee2e2',
      color: ok ? '#065f46' : '#991b1b',
    }) as React.CSSProperties,
  divider: {
    borderTop: '1px solid var(--border, #e5e7eb)',
    margin: '28px 0',
  } as React.CSSProperties,
  templateCard: {
    border: '1px solid var(--border, #e5e7eb)',
    borderRadius: 8,
    padding: '14px 16px',
    marginBottom: 10,
    display: 'flex',
    alignItems: 'center',
    gap: 12,
  } as React.CSSProperties,
  templateName: { flex: 1, fontWeight: 600, fontSize: 14 } as React.CSSProperties,
  templateSubject: {
    fontSize: 12,
    color: 'var(--fg-muted, #6b7280)',
  } as React.CSSProperties,
};

// ─── Types ────────────────────────────────────────────────────────────────────

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

interface EmailTemplateRow {
  id: string;
  name: string;
  subject: string;
  bodyHtml: string;
  bodyText?: string;
}

interface TemplateForm {
  name: string;
  subject: string;
  bodyHtml: string;
  bodyText: string;
}

const defaultConfig: EmailConfigForm = {
  provider: 'smtp',
  fromAddress: '',
  fromName: '',
  smtpHost: '',
  smtpPort: '587',
  smtpSecure: false,
  smtpUser: '',
  smtpPass: '',
  sesRegion: 'us-east-1',
  sesAccessKeyId: '',
  sesSecretAccessKey: '',
  resendApiKey: '',
};

const defaultTemplate: TemplateForm = {
  name: '',
  subject: '',
  bodyHtml: '',
  bodyText: '',
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function EmailIntegrationPage() {
  const { appId } = useParams<{ appId: string }>();
  const [config, setConfig] = useState<EmailConfigForm>(defaultConfig);
  const [templates, setTemplates] = useState<EmailTemplateRow[]>([]);
  const [status, setStatus] = useState<{ ok: boolean; msg: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testTo, setTestTo] = useState('');
  const [showTemplateForm, setShowTemplateForm] = useState(false);
  const [tplForm, setTplForm] = useState<TemplateForm>(defaultTemplate);
  const [tplSaving, setTplSaving] = useState(false);

  const loadConfig = useCallback(async () => {
    const res = await fetch(`/api/builder/apps/${appId}/integrations/email`);
    if (!res.ok) return;
    const data = (await res.json()) as { config: Partial<EmailConfigForm> | null };
    if (data.config) {
      setConfig((prev) => ({ ...prev, ...data.config }));
    }
  }, [appId]);

  const loadTemplates = useCallback(async () => {
    const res = await fetch(`/api/builder/apps/${appId}/email-templates`);
    if (!res.ok) return;
    const data = (await res.json()) as { templates: EmailTemplateRow[] };
    setTemplates(data.templates);
  }, [appId]);

  useEffect(() => {
    void loadConfig();
    void loadTemplates();
  }, [loadConfig, loadTemplates]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setStatus(null);
    try {
      const payload: Record<string, unknown> = {
        provider: config.provider,
        fromAddress: config.fromAddress,
        fromName: config.fromName,
      };
      if (config.provider === 'smtp') {
        Object.assign(payload, {
          smtpHost: config.smtpHost,
          smtpPort: parseInt(config.smtpPort, 10),
          smtpSecure: config.smtpSecure,
          smtpUser: config.smtpUser || undefined,
          smtpPass: config.smtpPass || undefined,
        });
      } else if (config.provider === 'ses') {
        Object.assign(payload, {
          sesRegion: config.sesRegion,
          sesAccessKeyId: config.sesAccessKeyId,
          sesSecretAccessKey: config.sesSecretAccessKey || undefined,
        });
      } else {
        payload['resendApiKey'] = config.resendApiKey || undefined;
      }

      const res = await fetch(`/api/builder/apps/${appId}/integrations/email`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        setStatus({ ok: true, msg: 'Email config saved.' });
      } else {
        const err = (await res.json()) as { error: unknown };
        setStatus({ ok: false, msg: JSON.stringify(err.error) });
      }
    } catch (err) {
      setStatus({ ok: false, msg: String(err) });
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    if (!testTo) return;
    setTesting(true);
    setStatus(null);
    try {
      const res = await fetch(`/api/runtime/novo/email/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          appId,
          to: testTo,
          subject: 'Test email from Novo',
          bodyHtml: '<p>This is a test email from your Novo Email integration.</p>',
        }),
      });
      if (res.ok) {
        setStatus({ ok: true, msg: `Test email sent to ${testTo}` });
      } else {
        const err = (await res.json()) as { error: unknown };
        setStatus({ ok: false, msg: `Test failed: ${JSON.stringify(err.error)}` });
      }
    } catch (err) {
      setStatus({ ok: false, msg: String(err) });
    } finally {
      setTesting(false);
    }
  };

  const handleSaveTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    setTplSaving(true);
    try {
      const res = await fetch(`/api/builder/apps/${appId}/email-templates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: tplForm.name,
          subject: tplForm.subject,
          bodyHtml: tplForm.bodyHtml,
          bodyText: tplForm.bodyText || undefined,
        }),
      });
      if (res.ok) {
        setShowTemplateForm(false);
        setTplForm(defaultTemplate);
        await loadTemplates();
      }
    } finally {
      setTplSaving(false);
    }
  };

  const handleDeleteTemplate = async (id: string) => {
    await fetch(`/api/builder/apps/${appId}/email-templates/${id}`, { method: 'DELETE' });
    await loadTemplates();
  };

  const field = (
    label: string,
    key: keyof EmailConfigForm,
    type = 'text',
    placeholder = '',
  ) => (
    <div style={S.section}>
      <label style={S.label}>{label}</label>
      {type === 'checkbox' ? (
        <input
          type="checkbox"
          checked={config[key] as boolean}
          onChange={(e) => setConfig((c) => ({ ...c, [key]: e.target.checked }))}
        />
      ) : (
        <input
          type={type}
          style={S.input}
          value={config[key] as string}
          placeholder={placeholder}
          onChange={(e) => setConfig((c) => ({ ...c, [key]: e.target.value }))}
        />
      )}
    </div>
  );

  return (
    <div style={S.container}>
      <h1 style={S.heading}>Email Integration</h1>
      <p style={S.sub}>Configure SMTP, AWS SES, or Resend to send emails from your app.</p>

      {status && <div style={S.alert(status.ok)}>{status.msg}</div>}

      <form onSubmit={(e) => { void handleSave(e); }}>
        {/* Provider picker */}
        <div style={S.section}>
          <label style={S.label}>Provider</label>
          <select
            style={S.select}
            value={config.provider}
            onChange={(e) =>
              setConfig((c) => ({ ...c, provider: e.target.value as EmailProvider }))
            }
          >
            <option value="smtp">SMTP</option>
            <option value="ses">AWS SES</option>
            <option value="resend">Resend</option>
          </select>
        </div>

        {/* From fields */}
        <div style={S.row}>
          <div style={S.col}>{field('From Address', 'fromAddress', 'email', 'noreply@example.com')}</div>
          <div style={S.col}>{field('From Name', 'fromName', 'text', 'My App')}</div>
        </div>

        {/* SMTP */}
        {config.provider === 'smtp' && (
          <>
            <div style={S.row}>
              <div style={{ flex: 2 }}>{field('SMTP Host', 'smtpHost', 'text', 'smtp.example.com')}</div>
              <div style={{ flex: 1 }}>{field('Port', 'smtpPort', 'number', '587')}</div>
            </div>
            {field('Username', 'smtpUser', 'text', 'user@example.com')}
            {field('Password', 'smtpPass', 'password', '••••••••')}
            <div style={S.section}>
              <label style={S.label}>
                <input
                  type="checkbox"
                  checked={config.smtpSecure}
                  onChange={(e) => setConfig((c) => ({ ...c, smtpSecure: e.target.checked }))}
                  style={{ marginRight: 8 }}
                />
                Use TLS (port 465)
              </label>
            </div>
          </>
        )}

        {/* SES */}
        {config.provider === 'ses' && (
          <>
            {field('AWS Region', 'sesRegion', 'text', 'us-east-1')}
            {field('Access Key ID', 'sesAccessKeyId', 'text', 'AKIA...')}
            {field('Secret Access Key', 'sesSecretAccessKey', 'password', '••••••••')}
          </>
        )}

        {/* Resend */}
        {config.provider === 'resend' && (
          <>{field('Resend API Key', 'resendApiKey', 'password', 're_...')}</>
        )}

        <div style={{ display: 'flex', alignItems: 'center', marginTop: 8 }}>
          <button type="submit" style={S.btn} disabled={saving}>
            {saving ? 'Saving…' : 'Save Config'}
          </button>
        </div>
      </form>

      {/* Test send */}
      <div style={S.divider} />
      <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>Test Send</h2>
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
        <div style={{ flex: 1 }}>
          <label style={S.label}>Send test to</label>
          <input
            type="email"
            style={S.input}
            value={testTo}
            placeholder="you@example.com"
            onChange={(e) => setTestTo(e.target.value)}
          />
        </div>
        <button style={S.btn} onClick={() => { void handleTest(); }} disabled={testing || !testTo}>
          {testing ? 'Sending…' : 'Send Test'}
        </button>
      </div>

      {/* Templates */}
      <div style={S.divider} />
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, flex: 1, margin: 0 }}>Email Templates</h2>
        <button
          style={S.btnSecondary}
          onClick={() => setShowTemplateForm((s) => !s)}
          type="button"
        >
          {showTemplateForm ? 'Cancel' : '+ New Template'}
        </button>
      </div>

      {showTemplateForm && (
        <form onSubmit={(e) => { void handleSaveTemplate(e); }} style={{ marginBottom: 24 }}>
          <div style={S.section}>
            <label style={S.label}>Template Name</label>
            <input
              style={S.input}
              value={tplForm.name}
              placeholder="e.g. order_confirmation"
              onChange={(e) => setTplForm((f) => ({ ...f, name: e.target.value }))}
              required
            />
          </div>
          <div style={S.section}>
            <label style={S.label}>Subject (supports {'{{ expr }}'})</label>
            <input
              style={S.input}
              value={tplForm.subject}
              placeholder="Your order #{{ order.number }} is ready"
              onChange={(e) => setTplForm((f) => ({ ...f, subject: e.target.value }))}
              required
            />
          </div>
          <div style={S.section}>
            <label style={S.label}>HTML Body (supports {'{{ expr }}'})</label>
            <textarea
              style={{ ...S.input, minHeight: 160, resize: 'vertical' }}
              value={tplForm.bodyHtml}
              placeholder={'<p>Hi {{ customer.name }},</p>'}
              onChange={(e) => setTplForm((f) => ({ ...f, bodyHtml: e.target.value }))}
              required
            />
          </div>
          <div style={S.section}>
            <label style={S.label}>Plain Text Fallback (optional)</label>
            <textarea
              style={{ ...S.input, minHeight: 80, resize: 'vertical' }}
              value={tplForm.bodyText}
              onChange={(e) => setTplForm((f) => ({ ...f, bodyText: e.target.value }))}
            />
          </div>
          <button type="submit" style={S.btn} disabled={tplSaving}>
            {tplSaving ? 'Saving…' : 'Save Template'}
          </button>
        </form>
      )}

      {templates.length === 0 && (
        <p style={{ fontSize: 13, color: 'var(--fg-muted, #6b7280)' }}>No templates yet.</p>
      )}

      {templates.map((tpl) => (
        <div key={tpl.id} style={S.templateCard}>
          <div style={{ flex: 1 }}>
            <div style={S.templateName}>{tpl.name}</div>
            <div style={S.templateSubject}>{tpl.subject}</div>
          </div>
          <button
            style={{ ...S.btnSecondary, marginLeft: 0 }}
            onClick={() => { void handleDeleteTemplate(tpl.id); }}
            type="button"
          >
            Delete
          </button>
        </div>
      ))}
    </div>
  );
}
