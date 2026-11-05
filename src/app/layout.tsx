import type { Metadata } from 'next';
import './globals.css';

// Font loaded via CSS custom property in globals.css (system fallback for build environments
// that cannot reach fonts.googleapis.com; production pages load Inter from Google Fonts via
// the CSS @import in globals.css which is not blocked at build time).
const inter = { className: 'font-sans' } as const;

export const metadata: Metadata = {
  title: 'LRBC ERP Platform',
  description: 'Multi-tenant ERP platform by LRBC',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={inter.className}>{children}</body>
    </html>
  );
}
