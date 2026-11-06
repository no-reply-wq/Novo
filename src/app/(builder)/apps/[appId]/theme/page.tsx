'use client'

import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import type { AppTheme } from '@/platform/theme/types'
import { THEME_PRESETS, DEFAULT_THEME } from '@/platform/theme/types'
import { generateThemeCss } from '@/platform/theme/css-generator'

const GOOGLE_FONTS = [
  'Inter', 'Roboto', 'Open Sans', 'Lato', 'Poppins',
  'Nunito', 'Montserrat', 'Raleway', 'Ubuntu', 'Merriweather',
]

// ─── Styles ───────────────────────────────────────────────────────────────────
const S: Record<string, React.CSSProperties> = {
  page: {
    display: 'flex',
    height: '100%',
    overflow: 'hidden',
    fontFamily: 'Inter, system-ui, sans-serif',
    fontSize: 14,
    color: 'var(--color-fg-base, #111)',
  },
  panel: {
    width: 320,
    minWidth: 300,
    flexShrink: 0,
    borderRight: '1px solid var(--color-border, #e5e7eb)',
    background: 'var(--color-bg-surface, #fff)',
    overflowY: 'auto',
    padding: '20px 16px',
    display: 'flex',
    flexDirection: 'column',
    gap: 24,
  },
  preview: {
    flex: 1,
    overflowY: 'auto',
    padding: 24,
    background: 'var(--color-bg-muted, #f9fafb)',
  },
  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: 700,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.08em',
    color: 'var(--color-fg-muted, #6b7280)',
    marginBottom: 2,
  },
  label: {
    fontSize: 12,
    fontWeight: 500,
    color: 'var(--color-fg-muted, #6b7280)',
    marginBottom: 2,
  },
  row: { display: 'flex', alignItems: 'center', gap: 8 },
  colorField: { display: 'flex', alignItems: 'center', gap: 8, width: '100%' },
  colorInput: { width: 32, height: 32, border: 'none', cursor: 'pointer', borderRadius: 6, padding: 0 },
  textInput: {
    flex: 1,
    padding: '4px 8px',
    border: '1px solid var(--color-border, #e5e7eb)',
    borderRadius: 6,
    fontSize: 12,
    background: 'var(--color-bg-base, #fff)',
    color: 'var(--color-fg-base, #111)',
  },
  radioGroup: { display: 'flex', gap: 6, flexWrap: 'wrap' as const },
  select: {
    width: '100%',
    padding: '6px 8px',
    border: '1px solid var(--color-border, #e5e7eb)',
    borderRadius: 6,
    fontSize: 13,
    background: 'var(--color-bg-base, #fff)',
    color: 'var(--color-fg-base, #111)',
  },
  textarea: {
    width: '100%',
    minHeight: 80,
    padding: '6px 8px',
    border: '1px solid var(--color-border, #e5e7eb)',
    borderRadius: 6,
    fontSize: 12,
    fontFamily: 'monospace',
    resize: 'vertical' as const,
    background: 'var(--color-bg-base, #fff)',
    color: 'var(--color-fg-base, #111)',
    boxSizing: 'border-box' as const,
  },
  presetGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 },
  saveBtn: {
    padding: '8px 16px',
    borderRadius: 8,
    background: 'var(--color-primary, #2563eb)',
    color: '#fff',
    fontWeight: 600,
    fontSize: 13,
    border: 'none',
    cursor: 'pointer',
    width: '100%',
    marginTop: 8,
  },
}

function radioBtnStyle(active: boolean): React.CSSProperties {
  return {
    padding: '5px 10px',
    borderRadius: 6,
    border: `1px solid ${active ? 'var(--color-primary, #2563eb)' : 'var(--color-border, #e5e7eb)'}`,
    background: active ? 'var(--color-primary, #2563eb)' : 'transparent',
    color: active ? '#fff' : 'var(--color-fg-muted, #6b7280)',
    fontSize: 12,
    cursor: 'pointer',
    fontWeight: active ? 600 : 400,
  }
}

function presetCardStyle(active: boolean): React.CSSProperties {
  return {
    padding: '8px 10px',
    borderRadius: 8,
    border: `2px solid ${active ? 'var(--color-primary, #2563eb)' : 'var(--color-border, #e5e7eb)'}`,
    cursor: 'pointer',
    background: active ? 'var(--color-primary, #2563eb)10' : 'transparent',
  }
}

// ─── Live Preview ─────────────────────────────────────────────────────────────
function LivePreview({ theme }: { theme: AppTheme }) {
  const css = generateThemeCss(theme)
  // Extract just the :root block content as inline style to scope to preview
  const previewStyle: React.CSSProperties = {
    '--primary': theme.primaryColor,
    '--primary-fg': theme.primaryForeground,
    '--accent': theme.accentColor,
    '--bg': theme.backgroundColor,
    '--surface': theme.surfaceColor,
    '--border': theme.borderColor,
    '--text': theme.textColor,
    '--text-muted': theme.mutedTextColor,
    '--error': theme.errorColor,
    '--success': theme.successColor,
    '--warning': theme.warningColor,
    '--radius': { none: '0px', small: '4px', medium: '8px', large: '12px', full: '9999px' }[theme.borderRadius],
    '--font': theme.fontFamily ? `'${theme.fontFamily}', system-ui, sans-serif` : 'system-ui, sans-serif',
  } as React.CSSProperties

  const previewBox: React.CSSProperties = {
    ...previewStyle,
    background: theme.backgroundColor,
    borderRadius: 12,
    overflow: 'hidden',
    border: '1px solid #e5e7eb',
    boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
    minHeight: 480,
    fontFamily: `var(--font, 'Inter', system-ui, sans-serif)`,
    fontSize: { compact: 13, default: 14, comfortable: 16 }[theme.fontSize],
  }

  const headerStyle: React.CSSProperties = {
    background: theme.primaryColor,
    color: theme.primaryForeground,
    padding: '12px 16px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  }

  const sidebarStyle: React.CSSProperties = {
    width: 160,
    background: theme.surfaceColor,
    borderRight: `1px solid ${theme.borderColor}`,
    padding: '12px 8px',
    flexShrink: 0,
  }

  const mainStyle: React.CSSProperties = {
    flex: 1,
    padding: 16,
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  }

  const cardStyle: React.CSSProperties = {
    background: theme.surfaceColor,
    border: `1px solid ${theme.borderColor}`,
    borderRadius: `var(--radius, 8px)`,
    padding: 12,
  }

  const btnPrimary: React.CSSProperties = {
    background: theme.primaryColor,
    color: theme.primaryForeground,
    border: 'none',
    borderRadius: `var(--radius, 8px)`,
    padding: '6px 14px',
    cursor: 'pointer',
    fontSize: 12,
    fontWeight: 600,
  }

  const btnSecondary: React.CSSProperties = {
    background: 'transparent',
    color: theme.primaryColor,
    border: `1px solid ${theme.primaryColor}`,
    borderRadius: `var(--radius, 8px)`,
    padding: '6px 14px',
    cursor: 'pointer',
    fontSize: 12,
    fontWeight: 600,
  }

  const badge = (color: string, bg: string): React.CSSProperties => ({
    display: 'inline-block',
    background: bg,
    color,
    borderRadius: 9999,
    padding: '2px 10px',
    fontSize: 11,
    fontWeight: 600,
  })

  const navItem = (active: boolean): React.CSSProperties => ({
    padding: '6px 10px',
    borderRadius: `var(--radius, 6px)`,
    cursor: 'pointer',
    fontSize: 12,
    color: active ? theme.primaryColor : theme.mutedTextColor,
    background: active ? `${theme.primaryColor}18` : 'transparent',
    fontWeight: active ? 600 : 400,
    marginBottom: 2,
  })

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '6px 10px',
    border: `1px solid ${theme.borderColor}`,
    borderRadius: `var(--radius, 6px)`,
    fontSize: 12,
    background: theme.backgroundColor,
    color: theme.textColor,
    boxSizing: 'border-box',
  }

  void css // css is generated but preview uses inline vars for scoping

  return (
    <div style={previewBox}>
      {/* Header */}
      <div style={headerStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 20, height: 20, background: `${theme.primaryForeground}40`, borderRadius: 4 }} />
          <span style={{ fontWeight: 700, fontSize: 15 }}>My App</span>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div style={{ width: 28, height: 28, borderRadius: '50%', background: `${theme.primaryForeground}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700 }}>JD</div>
        </div>
      </div>

      {/* Body */}
      <div style={{ display: 'flex', height: 'calc(100% - 44px)' }}>
        {/* Sidebar */}
        <div style={sidebarStyle}>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: theme.mutedTextColor, marginBottom: 6 }}>Navigation</div>
          {['Dashboard', 'Customers', 'Orders', 'Reports'].map((item, i) => (
            <div key={item} style={navItem(i === 0)}>{item}</div>
          ))}
        </div>

        {/* Main */}
        <div style={mainStyle}>
          {/* Stats row */}
          <div style={{ display: 'flex', gap: 10 }}>
            {[
              { label: 'Revenue', value: '$12,400' },
              { label: 'Orders', value: '284' },
              { label: 'Customers', value: '1,432' },
            ].map(stat => (
              <div key={stat.label} style={{ ...cardStyle, flex: 1, textAlign: 'center' as const }}>
                <div style={{ color: theme.mutedTextColor, fontSize: 11 }}>{stat.label}</div>
                <div style={{ color: theme.primaryColor, fontSize: 20, fontWeight: 700 }}>{stat.value}</div>
              </div>
            ))}
          </div>

          {/* Table card */}
          <div style={cardStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <span style={{ fontWeight: 600, color: theme.textColor }}>Recent Orders</span>
              <div style={{ display: 'flex', gap: 6 }}>
                <button style={btnSecondary}>Export</button>
                <button style={btnPrimary}>+ New</button>
              </div>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${theme.borderColor}` }}>
                  {['Name', 'Status', 'Amount'].map(col => (
                    <th key={col} style={{ textAlign: 'left', padding: '4px 8px', color: theme.mutedTextColor, fontWeight: 600 }}>{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[
                  { name: 'Alice Johnson', status: 'Paid', amount: '$240', statusColor: theme.successColor },
                  { name: 'Bob Smith', status: 'Pending', amount: '$120', statusColor: theme.warningColor },
                  { name: 'Carol Davis', status: 'Failed', amount: '$85', statusColor: theme.errorColor },
                ].map((row) => (
                  <tr key={row.name} style={{ borderBottom: `1px solid ${theme.borderColor}30` }}>
                    <td style={{ padding: '6px 8px', color: theme.textColor }}>{row.name}</td>
                    <td style={{ padding: '6px 8px' }}>
                      <span style={badge(row.statusColor, `${row.statusColor}18`)}>{row.status}</span>
                    </td>
                    <td style={{ padding: '6px 8px', color: theme.textColor, fontWeight: 600 }}>{row.amount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Form card */}
          <div style={cardStyle}>
            <div style={{ fontWeight: 600, marginBottom: 10, color: theme.textColor }}>Quick Add</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input style={{ ...inputStyle, flex: 2 }} placeholder="Customer name" readOnly />
              <input style={{ ...inputStyle, flex: 1 }} placeholder="Amount" readOnly />
              <button style={btnPrimary}>Add</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Color Field ──────────────────────────────────────────────────────────────
function ColorField({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div>
      <div style={S.label}>{label}</div>
      <div style={S.colorField}>
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={S.colorInput}
          aria-label={label}
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={S.textInput}
          maxLength={7}
          pattern="^#[0-9a-fA-F]{6}$"
          aria-label={`${label} hex`}
        />
      </div>
    </div>
  )
}

// ─── Radio Group ──────────────────────────────────────────────────────────────
function RadioGroup<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
}) {
  return (
    <div>
      <div style={S.label}>{label}</div>
      <div style={S.radioGroup}>
        {options.map((opt) => (
          <button
            key={opt.value}
            style={radioBtnStyle(value === opt.value)}
            onClick={() => onChange(opt.value)}
            type="button"
            aria-pressed={value === opt.value}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function ThemeEditorPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const appId = params?.appId as string
  const tenantSlug = searchParams?.get('tenant') ?? ''

  const [theme, setTheme] = useState<AppTheme>({
    ...DEFAULT_THEME,
    id: '',
    appId,
    tenantSlug,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  })
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')
  const [loading, setLoading] = useState(true)
  const saveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Load existing theme
  useEffect(() => {
    if (!appId || !tenantSlug) { setLoading(false); return }
    fetch(`/api/builder/apps/${appId}/theme?tenant=${tenantSlug}`)
      .then((r) => r.json())
      .then((data: { theme: AppTheme }) => {
        if (data.theme) setTheme({ ...data.theme, appId, tenantSlug })
      })
      .catch(() => {/* use defaults */})
      .finally(() => setLoading(false))
  }, [appId, tenantSlug])

  const update = useCallback((patch: Partial<AppTheme>) => {
    setTheme((t) => ({ ...t, ...patch }))
  }, [])

  const applyPreset = useCallback((preset: (typeof THEME_PRESETS)[number]) => {
    setTheme((t) => ({ ...t, ...preset.theme }))
  }, [])

  const save = useCallback(async () => {
    setSaving(true)
    setSaveMsg('')
    try {
      const res = await fetch(`/api/builder/apps/${appId}/theme?tenant=${tenantSlug}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(theme),
      })
      if (!res.ok) throw new Error('Save failed')
      const data = await res.json() as { theme: AppTheme }
      setTheme((t) => ({ ...t, ...data.theme }))
      setSaveMsg('Saved!')
    } catch {
      setSaveMsg('Error saving theme')
    } finally {
      setSaving(false)
      if (saveTimeout.current) clearTimeout(saveTimeout.current)
      saveTimeout.current = setTimeout(() => setSaveMsg(''), 3000)
    }
  }, [appId, tenantSlug, theme])

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#6b7280' }}>
        Loading theme…
      </div>
    )
  }

  return (
    <div style={S.page}>
      {/* Left panel */}
      <div style={S.panel}>
        <div>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, marginBottom: 4 }}>Theme Editor</h2>
          <p style={{ margin: 0, fontSize: 12, color: '#6b7280' }}>Customize your app's look and feel</p>
        </div>

        {/* Presets */}
        <div style={S.section}>
          <div style={S.sectionTitle}>Presets</div>
          <div style={S.presetGrid}>
            {THEME_PRESETS.map((preset) => {
              const isActive = theme.primaryColor === preset.theme.primaryColor
              return (
                <button
                  key={preset.name}
                  style={presetCardStyle(isActive)}
                  onClick={() => applyPreset(preset)}
                  type="button"
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                    <div style={{ width: 14, height: 14, borderRadius: '50%', background: preset.theme.primaryColor ?? '#2563eb' }} />
                    <span style={{ fontSize: 12, fontWeight: 600 }}>{preset.name}</span>
                  </div>
                  <div style={{ fontSize: 10, color: '#6b7280' }}>{preset.description}</div>
                </button>
              )
            })}
          </div>
        </div>

        {/* Colors */}
        <div style={S.section}>
          <div style={S.sectionTitle}>Colors</div>
          <ColorField label="Primary" value={theme.primaryColor} onChange={(v) => update({ primaryColor: v })} />
          <ColorField label="Primary Text" value={theme.primaryForeground} onChange={(v) => update({ primaryForeground: v })} />
          <ColorField label="Accent" value={theme.accentColor} onChange={(v) => update({ accentColor: v })} />
          <ColorField label="Background" value={theme.backgroundColor} onChange={(v) => update({ backgroundColor: v })} />
          <ColorField label="Surface" value={theme.surfaceColor} onChange={(v) => update({ surfaceColor: v })} />
          <ColorField label="Text" value={theme.textColor} onChange={(v) => update({ textColor: v })} />
        </div>

        {/* Typography */}
        <div style={S.section}>
          <div style={S.sectionTitle}>Typography</div>
          <div>
            <div style={S.label}>Font Family</div>
            <select
              style={S.select}
              value={theme.fontFamily}
              onChange={(e) => update({ fontFamily: e.target.value })}
              aria-label="Font family"
            >
              {GOOGLE_FONTS.map((f) => (
                <option key={f} value={f}>{f}</option>
              ))}
              <option value="system-ui">System UI</option>
            </select>
          </div>
          <RadioGroup
            label="Font Size"
            value={theme.fontSize}
            options={[
              { value: 'compact', label: 'Compact (13px)' },
              { value: 'default', label: 'Default (14px)' },
              { value: 'comfortable', label: 'Comfortable (16px)' },
            ]}
            onChange={(v) => update({ fontSize: v })}
          />
        </div>

        {/* Shape */}
        <div style={S.section}>
          <div style={S.sectionTitle}>Shape</div>
          <RadioGroup
            label="Border Radius"
            value={theme.borderRadius}
            options={[
              { value: 'none', label: 'None' },
              { value: 'small', label: 'Small' },
              { value: 'medium', label: 'Medium' },
              { value: 'large', label: 'Large' },
              { value: 'full', label: 'Full' },
            ]}
            onChange={(v) => update({ borderRadius: v })}
          />
        </div>

        {/* Density */}
        <div style={S.section}>
          <div style={S.sectionTitle}>Density</div>
          <RadioGroup
            label="Spacing"
            value={theme.density}
            options={[
              { value: 'compact', label: 'Compact' },
              { value: 'default', label: 'Default' },
              { value: 'comfortable', label: 'Comfortable' },
            ]}
            onChange={(v) => update({ density: v })}
          />
        </div>

        {/* Dark mode */}
        <div style={S.section}>
          <div style={S.sectionTitle}>Dark Mode</div>
          <RadioGroup
            label="Mode"
            value={theme.darkMode}
            options={[
              { value: 'light', label: 'Light' },
              { value: 'dark', label: 'Dark' },
              { value: 'system', label: 'System' },
            ]}
            onChange={(v) => update({ darkMode: v })}
          />
        </div>

        {/* Custom CSS */}
        <div style={S.section}>
          <div style={S.sectionTitle}>Custom CSS</div>
          <textarea
            style={S.textarea}
            value={theme.customCss ?? ''}
            onChange={(e) => update({ customCss: e.target.value })}
            placeholder="/* Add custom overrides here */"
            aria-label="Custom CSS"
          />
        </div>

        {/* Save */}
        <div>
          <button style={S.saveBtn} onClick={save} disabled={saving} type="button">
            {saving ? 'Saving…' : 'Save Theme'}
          </button>
          {saveMsg && (
            <div style={{ marginTop: 6, fontSize: 12, textAlign: 'center', color: saveMsg.startsWith('Error') ? '#dc2626' : '#16a34a' }}>
              {saveMsg}
            </div>
          )}
        </div>
      </div>

      {/* Right: live preview */}
      <div style={S.preview}>
        <div style={{ marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>Live Preview</h3>
          <p style={{ margin: '4px 0 0', fontSize: 12, color: '#6b7280' }}>Updates as you change settings</p>
        </div>
        <LivePreview theme={theme} />
      </div>
    </div>
  )
}
