import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { redirect } from 'next/navigation';
import DashboardBuilderClient from './client';

export const dynamic = 'force-dynamic';

export default async function DashboardBuilderPage({ params }: { params: Promise<{ tenantSlug: string }> }) {
  const { tenantSlug } = await params;
  const session = await getServerSession(authOptions);
  if (!session) redirect('/auth/signin');
  return <DashboardBuilderClient tenantSlug={tenantSlug} />;
}
