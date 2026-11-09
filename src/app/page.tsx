import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';

export default async function RootPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect('/login');
  if (session.user.isPlatformAdmin) redirect('/builder');
  if (session.user.tenantSlug) redirect('/builder');
  redirect('/login');
}
