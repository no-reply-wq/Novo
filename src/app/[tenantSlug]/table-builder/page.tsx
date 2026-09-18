import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { redirect } from 'next/navigation';
import TableBuilderClient from './client';

export const dynamic = 'force-dynamic';

export default async function TableBuilderPage({ params }: { params: Promise<{ tenantSlug: string }> }) {
  const { tenantSlug } = await params;
  const session = await getServerSession(authOptions);
  if (!session) redirect(`/auth/signin`);
  return <TableBuilderClient />;
}
