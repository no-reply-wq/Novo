/**
 * Loads app configuration from the database for the runtime.
 *
 * Apps are stored in the tenant schema (_apps table) as JSONB config.
 */

import { prisma, tenantQuery } from '@/lib/db/client';
import type { AppConfig, AppPage, ComponentInstance, QueryDefinition } from '@/types/runtime';

interface AppRow {
  id: string;
  name: string;
  slug: string;
  icon: string | null;
  color: string | null;
  config: unknown;
  published_at: Date | null;
}

export async function getAppConfig(
  tenantSlug: string,
  appSlug: string,
): Promise<AppConfig | null> {
  // Look up tenant to get schema name
  const tenant = await prisma.tenant.findUnique({
    where: { slug: tenantSlug },
    select: { id: true, slug: true },
  });
  if (!tenant) return null;

  // Query the _apps table inside the tenant schema
  const result = await tenantQuery<AppRow>(
    tenantSlug,
    `SELECT id, name, slug, icon, color, config, published_at
     FROM _apps
     WHERE slug = $1 AND published_at IS NOT NULL
     LIMIT 1`,
    [appSlug],
  );

  const app = result.rows[0];
  if (!app) return null;

  const raw = app.config as {
    navItems?: AppConfig['navItems'];
    pages?: unknown[];
  } | null;

  const pages: AppPage[] = Array.isArray(raw?.pages)
    ? (raw.pages as AppPage[]).map(normaliseAppPage)
    : [];

  return {
    id: app.id,
    name: app.name,
    slug: app.slug,
    icon: app.icon ?? undefined,
    color: app.color ?? undefined,
    navItems: raw?.navItems ?? pages.map((p) => ({ id: p.id, label: p.name, pageSlug: p.slug })),
    pages,
  };
}

function normaliseAppPage(raw: unknown): AppPage {
  const p = raw as Partial<AppPage>;
  return {
    id: p.id ?? '',
    name: p.name ?? '',
    slug: p.slug ?? '',
    layout: p.layout ?? { columns: 12, rowHeight: 48, gap: 8 },
    components: Array.isArray(p.components)
      ? (p.components as ComponentInstance[])
      : [],
    queries: Array.isArray(p.queries) ? (p.queries as QueryDefinition[]) : [],
  };
}
