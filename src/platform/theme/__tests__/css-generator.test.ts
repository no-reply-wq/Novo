import { generateThemeCss } from '../css-generator'
import type { AppTheme } from '../types'

const baseTheme: AppTheme = {
  id: 'test-id',
  appId: 'app-1',
  tenantSlug: 'acme',
  name: 'Test Theme',
  primaryColor: '#2563eb',
  primaryForeground: '#ffffff',
  accentColor: '#8b5cf6',
  backgroundColor: '#f9fafb',
  surfaceColor: '#ffffff',
  borderColor: '#e5e7eb',
  textColor: '#111827',
  mutedTextColor: '#6b7280',
  errorColor: '#dc2626',
  successColor: '#16a34a',
  warningColor: '#d97706',
  fontFamily: 'Inter',
  fontSize: 'default',
  borderRadius: 'medium',
  density: 'default',
  darkMode: 'light',
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
}

describe('generateThemeCss', () => {
  it('includes all CSS variables', () => {
    const css = generateThemeCss(baseTheme)
    expect(css).toContain('--primary:')
    expect(css).toContain('--primary-fg:')
    expect(css).toContain('--accent:')
    expect(css).toContain('--bg:')
    expect(css).toContain('--surface:')
    expect(css).toContain('--border:')
    expect(css).toContain('--text:')
    expect(css).toContain('--text-muted:')
    expect(css).toContain('--error:')
    expect(css).toContain('--success:')
    expect(css).toContain('--warning:')
    expect(css).toContain('--radius:')
    expect(css).toContain('--font:')
    expect(css).toContain('--font-size-base:')
    expect(css).toContain('--spacing-base:')
  })

  it('maps border radius values correctly', () => {
    const noneTheme = { ...baseTheme, borderRadius: 'none' as const }
    expect(generateThemeCss(noneTheme)).toContain('--radius: 0px')

    const smallTheme = { ...baseTheme, borderRadius: 'small' as const }
    expect(generateThemeCss(smallTheme)).toContain('--radius: 4px')

    const mediumTheme = { ...baseTheme, borderRadius: 'medium' as const }
    expect(generateThemeCss(mediumTheme)).toContain('--radius: 8px')

    const largeTheme = { ...baseTheme, borderRadius: 'large' as const }
    expect(generateThemeCss(largeTheme)).toContain('--radius: 12px')

    const fullTheme = { ...baseTheme, borderRadius: 'full' as const }
    expect(generateThemeCss(fullTheme)).toContain('--radius: 9999px')
  })

  it('does NOT include dark mode block when darkMode is light', () => {
    const css = generateThemeCss({ ...baseTheme, darkMode: 'light' })
    expect(css).not.toContain('@media (prefers-color-scheme: dark)')
    // Should only have one :root block
    const rootCount = (css.match(/:root/g) ?? []).length
    expect(rootCount).toBe(1)
  })

  it('generates dark mode media query when darkMode is system', () => {
    const css = generateThemeCss({ ...baseTheme, darkMode: 'system' })
    expect(css).toContain('@media (prefers-color-scheme: dark)')
  })

  it('generates forced dark mode without media query when darkMode is dark', () => {
    const css = generateThemeCss({ ...baseTheme, darkMode: 'dark' })
    expect(css).not.toContain('@media (prefers-color-scheme: dark)')
    // The override root block is added
    expect(css).toContain('--bg: #0f172a')
  })

  it('appends custom CSS at end', () => {
    const css = generateThemeCss({ ...baseTheme, customCss: '.my-class { color: red; }' })
    expect(css).toContain('.my-class { color: red; }')
    // Custom CSS must come after :root block
    const rootIdx = css.indexOf(':root')
    const customIdx = css.indexOf('.my-class')
    expect(customIdx).toBeGreaterThan(rootIdx)
  })

  it('includes Google Font import for known fonts', () => {
    const css = generateThemeCss({ ...baseTheme, fontFamily: 'Poppins' })
    expect(css).toContain('@import url(')
    expect(css).toContain('fonts.googleapis.com')
    expect(css).toContain('Poppins')
  })

  it('does NOT include Google Font import for system fonts', () => {
    const css = generateThemeCss({ ...baseTheme, fontFamily: 'system-ui' })
    expect(css).not.toContain('@import url(')
  })

  it('maps font sizes correctly', () => {
    expect(generateThemeCss({ ...baseTheme, fontSize: 'compact' })).toContain('--font-size-base: 13px')
    expect(generateThemeCss({ ...baseTheme, fontSize: 'default' })).toContain('--font-size-base: 14px')
    expect(generateThemeCss({ ...baseTheme, fontSize: 'comfortable' })).toContain('--font-size-base: 16px')
  })

  it('maps density to spacing correctly', () => {
    expect(generateThemeCss({ ...baseTheme, density: 'compact' })).toContain('--spacing-base: 12px')
    expect(generateThemeCss({ ...baseTheme, density: 'default' })).toContain('--spacing-base: 16px')
    expect(generateThemeCss({ ...baseTheme, density: 'comfortable' })).toContain('--spacing-base: 20px')
  })
})
