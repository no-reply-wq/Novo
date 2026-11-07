import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        background: 'var(--background)',
        foreground: 'var(--foreground)',
        card: { DEFAULT: 'var(--card)', fg: 'var(--card-fg)' },
        popover: { DEFAULT: 'var(--popover)', fg: 'var(--popover-fg)' },
        primary: { DEFAULT: 'var(--primary)', fg: 'var(--primary-fg)' },
        secondary: { DEFAULT: 'var(--secondary)', fg: 'var(--secondary-fg)' },
        muted: { DEFAULT: 'var(--muted)', fg: 'var(--muted-fg)' },
        accent: { DEFAULT: 'var(--accent)', fg: 'var(--accent-fg)' },
        destructive: { DEFAULT: 'var(--destructive)', fg: 'var(--destructive-fg)' },
        success: { DEFAULT: 'var(--success)', fg: 'var(--success-fg)' },
        warning: { DEFAULT: 'var(--warning)', fg: 'var(--warning-fg)', bg: 'var(--warning-bg)', border: 'var(--warning-border)' },
        border: 'var(--border)',
        input: 'var(--input-bg)',
        ring: 'var(--ring)',
        // Raw tokens (keep existing components working)
        'color-bg-base': 'var(--color-bg-base)',
        'color-bg-surface': 'var(--color-bg-surface)',
        'color-bg-muted': 'var(--color-bg-muted)',
        'color-fg-base': 'var(--color-fg-base)',
        'color-fg-muted': 'var(--color-fg-muted)',
        'color-border': 'var(--color-border)',
        'color-primary': 'var(--color-primary)',
        'color-primary-fg': 'var(--color-primary-fg)',
        'color-secondary': 'var(--color-secondary)',
        'color-success': 'var(--color-success)',
        'color-warning': 'var(--color-warning)',
        'color-danger': 'var(--color-danger)',
        'color-info': 'var(--color-info)',
      },
      borderRadius: {
        sm: 'var(--radius-sm)',
        md: 'var(--radius-md)',
        lg: 'var(--radius-lg)',
        xl: 'var(--radius-xl)',
      },
      boxShadow: {
        sm: 'var(--shadow-sm)',
        md: 'var(--shadow-md)',
        lg: 'var(--shadow-lg)',
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'monospace'],
      },
    },
  },
  plugins: [],
};

export default config;
