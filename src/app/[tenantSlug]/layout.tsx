import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth/config';
import { resolveTenantFromSlug } from '@/lib/tenant/resolver';
import { TenantLayout } from '@/components/layout/TenantLayout';

export default async function TenantAppLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    redirect(`/login?tenant=${tenantSlug}`);
  }

  const isPlatformAdmin = session.user.isPlatformAdmin;

  if (!isPlatformAdmin && session.user.tenantSlug !== tenantSlug) {
    redirect(`/login?tenant=${tenantSlug}`);
  }

  const tenant = await resolveTenantFromSlug(tenantSlug);
  if (!tenant) redirect('/login');

  if (tenant.status === 'SUSPENDED') {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="text-center max-w-md">
          <h1 className="text-xl font-semibold text-slate-900 mb-2">Account suspended</h1>
          <p className="text-slate-500 text-sm">
            This account has been temporarily suspended. Please contact LRBC support.
          </p>
        </div>
      </div>
    );
  }

  return (
    <TenantLayout
      tenantSlug={tenantSlug}
      tenantName={tenant.name}
      tenantColor={tenant.primaryColor ?? '#6366f1'}
      logoUrl={tenant.logoUrl ?? undefined}
      userEmail={session.user.email}
      userName={session.user.name ?? session.user.email}
    >
      {children}
    </TenantLayout>
  );
}
