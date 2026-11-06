import type { AppTheme } from './types'

const BORDER_RADIUS_MAP: Record<AppTheme['borderRadius'], string> = {
  none: '0px',
  small: '4px',
  medium: '8px',
  large: '12px',
  full: '9999px',
}

const FONT_SIZE_MAP: Record<AppTheme['fontSize'], string> = {
  compact: '13px',
  default: '14px',
  comfortable: '16px',
}

const SPACING_MAP: Record<AppTheme['density'], string> = {
  compact: '12px',
  default: '16px',
  comfortable: '20px',
}

const GOOGLE_FONTS_SAFE = new Set([
  'Inter', 'Roboto', 'Open Sans', 'Lato', 'Poppins', 'Nunito', 'Source Sans Pro',
  'Raleway', 'Montserrat', 'Ubuntu', 'Playfair Display', 'Merriweather',
])

const SYSTEM_FONTS = new Set([
  'system-ui', 'sans-serif', 'serif', 'monospace', 'Arial', 'Georgia',
  'Helvetica', 'Times New Roman', 'Verdana',
])

/**
 * Parse a hex color into HSL components.
 * Returns [h, s, l] where h in [0,360), s in [0,100], l in [0,100].
 */
function hexToHsl(hex: string): [number, number, number] {
  const clean = hex.replace('#', '')
  if (clean.length !== 6) return [0, 0, 50]

  const r = parseInt(clean.slice(0, 2), 16) / 255
  const g = parseInt(clean.slice(2, 4), 16) / 255
  const b = parseInt(clean.slice(4, 6), 16) / 255

  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2

  if (max === min) {
    return [0, 0, Math.round(l * 100)]
  }

  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)

  let h = 0
  if (max === r) {
    h = ((g - b) / d + (g < b ? 6 : 0)) / 6
  } else if (max === g) {
    h = ((b - r) / d + 2) / 6
  } else {
    h = ((r - g) / d + 4) / 6
  }

  return [Math.round(h * 360), Math.round(s * 100), Math.round(l * 100)]
}

/**
 * Darken a hex color using HSL manipulation (flip lightness toward dark).
 * Keeps hue and saturation, flips lightness: l → 100 - l (then adjust to remain visible).
 */
function darkenColor(hex: string): string {
  const [h, s, l] = hexToHsl(hex)
  // For dark mode: if original is light (l > 50), flip to dark. If already dark, lighten slightly.
  const darkL = l > 50 ? 100 - l : Math.min(l + 30, 90)
  return `hsl(${h}, ${s}%, ${darkL}%)`
}

/**
 * Generate CSS for the given theme.
 * Returns a full <style> block string.
 */
export function generateThemeCss(theme: AppTheme): string {
  const radius = BORDER_RADIUS_MAP[theme.borderRadius] ?? '8px'
  const fontSize = FONT_SIZE_MAP[theme.fontSize] ?? '14px'
  const spacing = SPACING_MAP[theme.density] ?? '16px'

  const fontFamily = theme.fontFamily
    ? GOOGLE_FONTS_SAFE.has(theme.fontFamily)
      ? `'${theme.fontFamily}', system-ui, sans-serif`
      : SYSTEM_FONTS.has(theme.fontFamily)
        ? theme.fontFamily
        : `'${theme.fontFamily}', system-ui, sans-serif`
    : 'system-ui, sans-serif'

  const needsGoogleFont =
    theme.fontFamily && GOOGLE_FONTS_SAFE.has(theme.fontFamily)

  const fontImport = needsGoogleFont
    ? `@import url('https://fonts.googleapis.com/css2?family=${encodeURIComponent(theme.fontFamily).replace(/%20/g, '+')}&display=swap');\n\n`
    : ''

  const rootVars = `:root {
  --primary: ${theme.primaryColor};
  --primary-fg: ${theme.primaryForeground};
  --accent: ${theme.accentColor};
  --bg: ${theme.backgroundColor};
  --surface: ${theme.surfaceColor};
  --border: ${theme.borderColor};
  --text: ${theme.textColor};
  --text-muted: ${theme.mutedTextColor};
  --error: ${theme.errorColor};
  --success: ${theme.successColor};
  --warning: ${theme.warningColor};
  --radius: ${radius};
  --font: ${fontFamily};
  --font-size-base: ${fontSize};
  --spacing-base: ${spacing};
}`

  let darkBlock = ''
  if (theme.darkMode !== 'light') {
    const darkColors = `
  --primary: ${darkenColor(theme.primaryColor)};
  --accent: ${darkenColor(theme.accentColor)};
  --bg: #0f172a;
  --surface: #1e293b;
  --border: #334155;
  --text: #f1f5f9;
  --text-muted: #94a3b8;
  --error: ${darkenColor(theme.errorColor)};
  --success: ${darkenColor(theme.successColor)};
  --warning: ${darkenColor(theme.warningColor)};`

    if (theme.darkMode === 'system') {
      darkBlock = `\n\n@media (prefers-color-scheme: dark) {\n  :root {${darkColors}\n  }\n}`
    } else if (theme.darkMode === 'dark') {
      darkBlock = `\n\n:root {${darkColors}\n}`
    }
  }

  const customCssBlock = theme.customCss ? `\n\n/* Custom CSS */\n${theme.customCss}` : ''

  return `${fontImport}<style>\n${rootVars}${darkBlock}${customCssBlock}\n</style>`
}
