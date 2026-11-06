import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth/config';
import { pgPool } from '@/lib/db/client';
import { AppSelector } from '@/components/builder/AppSelector';

export const metadata = { title: 'Builder — Apps' };

export default async function BuilderHomePage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect('/login');

  // Platform admins have no tenantSlug — resolve the first tenant they can access
  let tenantSlug = session.user.tenantSlug ?? '';
  if (!tenantSlug && session.user.isPlatformAdmin) {
    try {
      const result = await pgPool.query<{ slug: string }>(
        'SELECT slug FROM public.tenants WHERE status = $1 ORDER BY created_at LIMIT 1',
        ['ACTIVE']
      );
      tenantSlug = result.rows[0]?.slug ?? '';
    } catch {
      // DB not reachable or tenants table missing — show empty state
      tenantSlug = '';
    }
  }

  return (
    <AppSelector
      tenantSlug={tenantSlug}
      userEmail={session.user.email}
    />
  );
}
