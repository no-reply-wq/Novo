import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth/config';
import { ServiceWorkerRegistrar } from '@/components/runtime/ServiceWorkerRegistrar';
import { OfflineIndicator } from '@/components/runtime/OfflineIndicator';

export default async function RuntimeLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    redirect('/login');
  }

  return (
    <>
      <ServiceWorkerRegistrar />
      <OfflineIndicator />
      {children}
    </>
  );
}
