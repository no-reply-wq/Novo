import { getServerSession } from 'next-auth';
import { redirect, notFound } from 'next/navigation';
import { authOptions } from '@/lib/auth/config';
import { getAppConfig } from '@/lib/runtime/app-loader';
import { checkPageAccess } from '@/lib/auth/permissions';
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

  // Enforce page-level role permissions.
  const access = await checkPageAccess(tenantSlug, appSlug, pageSlug, session.user.id);
  if (!access.allowed) {
    return (
      <AppShell
        app={app}
        tenantSlug={tenantSlug}
        currentPageSlug={pageSlug}
        userName={session.user.name ?? session.user.email}
        userEmail={session.user.email}
      >
        <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
          <div className="rounded-full bg-red-100 p-4 dark:bg-red-900/30">
            <svg
              className="h-8 w-8 text-red-600 dark:text-red-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
              />
            </svg>
          </div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">
            403 — Access Denied
          </h1>
          <p className="max-w-sm text-gray-500 dark:text-gray-400">
            {access.reason ?? 'You do not have permission to view this page.'}
          </p>
          <a
            href={`/${tenantSlug}/${appSlug}`}
            className="mt-2 rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-300"
          >
            Go Back
          </a>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell
      app={app}
      tenantSlug={tenantSlug}
      currentPageSlug={pageSlug}
      userName={session.user.name ?? session.user.email}
      userEmail={session.user.email}
    >
      <PageRenderer page={page} tenantSlug={tenantSlug} appSlug={appSlug} />
    </AppShell>
  );
}
