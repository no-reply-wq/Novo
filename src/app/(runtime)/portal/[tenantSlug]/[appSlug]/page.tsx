import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth/config';
import { getAppConfig } from '@/lib/runtime/app-loader';
import { checkPageAccess } from '@/lib/auth/permissions';

export const dynamic = 'force-dynamic';

export default async function AppHomePage({
  params,
}: {
  params: Promise<{ tenantSlug: string; appSlug: string }>;
}) {
  const { tenantSlug, appSlug } = await params;
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect('/login');

  const app = await getAppConfig(tenantSlug, appSlug);
  if (!app) {
    return (
      <div className="flex h-screen items-center justify-center">
        <p className="text-gray-500">App not found.</p>
      </div>
    );
  }

  if (app.pages.length === 0) {
    return (
      <div className="flex h-screen items-center justify-center">
        <p className="text-gray-500">This app has no pages yet.</p>
      </div>
    );
  }

  // Find the first page the user is allowed to view.
  // checkPageAccess is cheap for the first match and returns quickly once it
  // finds a permitted page; we bail out as soon as one is found.
  let firstAllowedPage: string | null = null;
  for (const pg of app.pages) {
    const access = await checkPageAccess(tenantSlug, appSlug, pg.slug, session.user.id);
    if (access.allowed) {
      firstAllowedPage = pg.slug;
      break;
    }
  }

  if (!firstAllowedPage) {
    // User has no access to any page in this app.
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 p-8 text-center">
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
          You do not have permission to access this application.
        </p>
        <a
          href={`/${tenantSlug}`}
          className="mt-2 rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-300"
        >
          Go Back
        </a>
      </div>
    );
  }

  redirect(`/portal/${tenantSlug}/${appSlug}/p/${firstAllowedPage}`);
}
