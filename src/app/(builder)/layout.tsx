import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth/config';
import { BuilderShell } from '@/components/builder/BuilderShell';

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
