import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth/config';
import { getAppConfig } from '@/lib/runtime/app-loader';

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

  const firstPage = app.pages[0];
  if (!firstPage) {
    return (
      <div className="flex h-screen items-center justify-center">
        <p className="text-gray-500">This app has no pages yet.</p>
      </div>
    );
  }

  redirect(`/${tenantSlug}/${appSlug}/p/${firstPage.slug}`);
}
