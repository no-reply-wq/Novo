import { redirect } from 'next/navigation';

export default async function LegacyPortalPageRedirect({
  params,
}: {
  params: Promise<{ tenantSlug: string; appSlug: string; pageSlug: string }>;
}) {
  const { tenantSlug, appSlug, pageSlug } = await params;
  redirect(`/portal/${tenantSlug}/${appSlug}/p/${pageSlug}`);
}
