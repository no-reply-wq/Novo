import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth/config';
import { PageHeader } from '@/components/layout/TenantLayout';
import IntegrationForm from '@/components/integrations/IntegrationForm';

interface Props {
  params: Promise<{ tenantSlug: string }>;
}

export default async function IntegrationsPage({ params }: Props) {
  const { tenantSlug } = await params;
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect(`/login?tenant=${tenantSlug}`);

  // Fetch existing integrations server-side (best-effort; empty on error)
  let integrations: unknown[] = [];
  try {
    const baseUrl = process.env.NEXTAUTH_URL ?? 'http://localhost:3000';
    const res = await fetch(`${baseUrl}/api/tenant/integrations?tenant=${tenantSlug}`, {
      headers: { Cookie: '' }, // SSR fetch — auth handled separately
      cache: 'no-store',
    });
    if (res.ok) integrations = await res.json();
  } catch {
    // ignore; client will show empty state
  }

  return (
    <>
      <PageHeader title="Integrations" />
      <IntegrationForm tenantSlug={tenantSlug} initialIntegrations={integrations as never} />
    </>
  );
}
