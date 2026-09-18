import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { redirect } from 'next/navigation';
import ModuleClient from './client';

export const dynamic = 'force-dynamic';

export default async function ModulePage({ params }: { params: Promise<{ tenantSlug: string; module: string }> }) {
  const { tenantSlug, module } = await params;
  const session = await getServerSession(authOptions);
  if (!session) redirect('/auth/signin');
  return <ModuleClient tenantSlug={tenantSlug} module={module} />;
}
