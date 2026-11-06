import type { Metadata } from 'next';
import './globals.css';
import { SessionProvider } from '@/components/providers/SessionProvider';

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
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#2563eb" />
      </head>
      <body className={inter.className}>
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  );
}
