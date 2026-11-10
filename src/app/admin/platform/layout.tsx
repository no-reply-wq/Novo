import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth/config';
import { PlatformAdminSidebar } from '@/components/admin/PlatformAdminSidebar';

export default async function PlatformAdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.isPlatformAdmin) {
    redirect('/login?mode=admin');
  }

  return (
    <div className="flex h-screen bg-[var(--color-bg-base)]">
      <PlatformAdminSidebar userName={session.user.name ?? ''} userEmail={session.user.email ?? ''} />
      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}
