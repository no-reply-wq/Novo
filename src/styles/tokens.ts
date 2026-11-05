/**
 * TypeScript mirror of CSS custom property tokens.
 * Use these in JS/TS contexts (e.g. canvas drawing, inline styles).
 * For styling components, prefer the CSS variables directly.
 */

export const tokens = {
  color: {
    bgBase: 'var(--color-bg-base)',
    bgSurface: 'var(--color-bg-surface)',
    bgMuted: 'var(--color-bg-muted)',
    fgBase: 'var(--color-fg-base)',
    fgMuted: 'var(--color-fg-muted)',
    border: 'var(--color-border)',
    primary: 'var(--color-primary)',
    primaryFg: 'var(--color-primary-fg)',
    secondary: 'var(--color-secondary)',
    success: 'var(--color-success)',
    warning: 'var(--color-warning)',
    danger: 'var(--color-danger)',
    info: 'var(--color-info)',
  },
  radius: {
    sm: 'var(--radius-sm)',
    md: 'var(--radius-md)',
    lg: 'var(--radius-lg)',
    full: 'var(--radius-full)',
  },
  shadow: {
    sm: 'var(--shadow-sm)',
    md: 'var(--shadow-md)',
    lg: 'var(--shadow-lg)',
  },
  font: {
    sans: 'var(--font-sans)',
    mono: 'var(--font-mono)',
  },
  text: {
    xs: 'var(--text-xs)',
    sm: 'var(--text-sm)',
    base: 'var(--text-base)',
    lg: 'var(--text-lg)',
    xl: 'var(--text-xl)',
    '2xl': 'var(--text-2xl)',
  },
} as const;

export type TokenColor = keyof typeof tokens.color;
export type TokenRadius = keyof typeof tokens.radius;
export type TokenShadow = keyof typeof tokens.shadow;
