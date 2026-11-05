import { getServerSession } from 'next-auth';
import { redirect, notFound } from 'next/navigation';
import { authOptions } from '@/lib/auth/config';
import { getAppConfig } from '@/lib/runtime/app-loader';
import { AppShell } from '@/components/runtime/AppShell';
import { PageRenderer } from '@/components/runtime/PageRenderer';

export const dynamic = 'force-dynamic';

export default async function AppPageRoute({
  params,
}: {
  params: Promise<{ tenantSlug: string; appSlug: string; pageSlug: string }>;
}) {
  const { tenantSlug, appSlug, pageSlug } = await params;
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect('/login');

  const app = await getAppConfig(tenantSlug, appSlug);
  if (!app) notFound();

  const page = app.pages.find((p) => p.slug === pageSlug);
  if (!page) notFound();

  // notFound() throws — TypeScript doesn't know, so assert:
  const resolvedApp = app!;
  const resolvedPage = page!;

  return (
    <AppShell
      app={resolvedApp}
      tenantSlug={tenantSlug}
      currentPageSlug={pageSlug}
      userName={session.user.name ?? session.user.email}
      userEmail={session.user.email}
    >
      <PageRenderer page={resolvedPage} tenantSlug={tenantSlug} appSlug={appSlug} />
    </AppShell>
  );
}
