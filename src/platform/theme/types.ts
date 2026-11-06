export interface AppTheme {
  id: string
  appId: string
  tenantSlug: string
  name: string

  // Colors
  primaryColor: string        // e.g. "#2563eb"
  primaryForeground: string   // text on primary
  accentColor: string
  backgroundColor: string
  surfaceColor: string        // cards, panels
  borderColor: string
  textColor: string
  mutedTextColor: string
  errorColor: string
  successColor: string
  warningColor: string

  // Typography
  fontFamily: string          // Google Font name or system font
  fontSize: 'compact' | 'default' | 'comfortable'  // 13/14/16px base

  // Shape
  borderRadius: 'none' | 'small' | 'medium' | 'large' | 'full'  // 0/4/8/12/9999px

  // Density
  density: 'compact' | 'default' | 'comfortable'  // spacing scale

  // Dark mode
  darkMode: 'light' | 'dark' | 'system'

  // Custom CSS (escape hatch)
  customCss?: string

  createdAt: string
  updatedAt: string
}

export interface ThemePreset {
  name: string
  description: string
  theme: Partial<AppTheme>
}

export const THEME_PRESETS: ThemePreset[] = [
  {
    name: 'Default Blue',
    description: 'Clean professional blue',
    theme: { primaryColor: '#2563eb', borderRadius: 'medium', density: 'default' }
  },
  {
    name: 'Forest Green',
    description: 'Natural and calm',
    theme: { primaryColor: '#16a34a', borderRadius: 'medium', density: 'default' }
  },
  {
    name: 'Sunset Orange',
    description: 'Warm and energetic',
    theme: { primaryColor: '#ea580c', borderRadius: 'large', density: 'comfortable' }
  },
  {
    name: 'Deep Purple',
    description: 'Bold and modern',
    theme: { primaryColor: '#7c3aed', borderRadius: 'small', density: 'compact' }
  },
  {
    name: 'Minimal Dark',
    description: 'Dark mode first',
    theme: { primaryColor: '#6366f1', darkMode: 'dark', borderRadius: 'small' }
  }
]

export const DEFAULT_THEME: Omit<AppTheme, 'id' | 'appId' | 'tenantSlug' | 'createdAt' | 'updatedAt'> = {
  name: 'Default',
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
}
