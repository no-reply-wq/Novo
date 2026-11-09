import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth/config';
import { AppSelector } from '@/components/builder/AppSelector';

export const metadata = { title: 'Builder — Apps' };

export default async function BuilderHomePage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect('/login');

  return (
    <AppSelector
      tenantSlug={session.user.tenantSlug ?? ''}
      userEmail={session.user.email}
      isPlatformAdmin={session.user.isPlatformAdmin ?? false}
    />
  );
}
