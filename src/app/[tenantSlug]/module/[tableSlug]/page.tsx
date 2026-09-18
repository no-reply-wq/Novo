import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { redirect } from 'next/navigation';
import ModulePageClient from './client';

export const dynamic = 'force-dynamic';

export default async function ModulePage({ params }: { params: Promise<{ tenantSlug: string; tableSlug: string }> }) {
  const { tenantSlug, tableSlug } = await params;
  const session = await getServerSession(authOptions);
  if (!session) redirect('/auth/signin');
  return <ModulePageClient tenantSlug={tenantSlug} tableSlug={tableSlug} />;
}
