import { redirect } from 'next/navigation';

// This route existed in an earlier version as the portal entry point.
// The portal has since moved to /portal/[tenantSlug]/[appSlug].
// Redirect so any bookmarked or cached links still work.
export default async function LegacyPortalRedirect({
  params,
}: {
  params: Promise<{ tenantSlug: string; appSlug: string }>;
}) {
  const { tenantSlug, appSlug } = await params;
  redirect(`/portal/${tenantSlug}/${appSlug}`);
}
