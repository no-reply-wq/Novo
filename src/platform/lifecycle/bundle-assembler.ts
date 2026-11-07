/**
 * Bundle assembler — collects all app artefacts from the database and
 * assembles them into a lifecycle AppBundle.
 */

import { Pool, PoolClient } from 'pg';
import { exportApp } from '../packaging/exporter';
import type { AppBundle } from './types';

interface AppRow {
  id: string;
  color: string | null;
  slug: string | null;
}

export async function assembleBundle(
  appId: string,
  pgPool: Pool | PoolClient,
  tenantSlug?: string,
  exportedBy?: string,
): Promise<AppBundle> {
  let resolvedTenant = tenantSlug ?? '';
  let client: PoolClient | undefined;
  let isPool = false;

  if ('connect' in pgPool && typeof (pgPool as Pool).connect === 'function') {
    isPool = true;
    client = await (pgPool as Pool).connect();
  } else {
    client = pgPool as PoolClient;
  }

  try {
    if (!resolvedTenant) {
      const res = await client.query<{ tenant_slug: string }>(
        'SELECT tenant_slug FROM public.apps WHERE id = $1',
        [appId],
      );
      if ((res.rowCount ?? 0) === 0) {
        throw new Error('App ' + appId + ' not found');
      }
      resolvedTenant = res.rows[0].tenant_slug;
    }

    const colorRes = await client.query<AppRow>(
      'SELECT id, color, slug FROM public.apps WHERE id = $1 AND tenant_slug = $2',
      [appId, resolvedTenant],
    );
    const appRow = colorRes.rows[0];

    const pkg = await exportApp(appId, resolvedTenant, client, exportedBy ?? 'system');

    const bundle: AppBundle = {
      schemaVersion: '1.0',
      exportedAt: pkg.exportedAt,
      app: {
        id: appId,
        name: pkg.app.name,
        description: pkg.app.description,
        icon: pkg.app.icon,
        color: appRow?.color ?? undefined,
      },
      schema: pkg.schema,
      ui: pkg.ui,
      logic: pkg.logic,
      scripts: (pkg.scripts ?? []).map((s) => {
        const raw = s as unknown as Record<string, unknown>;
        return {
          id: (raw['id'] as string) ?? '',
          name: s.name,
          code: s.code,
          testCases: (s.testCases ?? []) as unknown[],
        };
      }),
      integrations: pkg.integrations,
      marketplace: pkg.marketplace,
    };

    return bundle;
  } finally {
    if (isPool && client) {
      (client as PoolClient).release();
    }
  }
}
