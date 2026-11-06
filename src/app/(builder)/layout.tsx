import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth/config';
import { BuilderShell } from '@/components/builder/BuilderShell';

// Next.js 16: opt out of static shell prerendering so cookies() is always
// available for getServerSession(). Without this, the layout is prerendered
// at build/startup time without request cookies, causing an unconditional
// redirect to /login for all authenticated users.
export const dynamic = 'force-dynamic';

export default async function BuilderLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    redirect('/login');
  }

  return (
    <BuilderShell
      tenantName={session.user.tenantSlug ?? 'Platform'}
      userName={session.user.name ?? session.user.email}
      userEmail={session.user.email}
    >
      {children}
    </BuilderShell>
  );
}
