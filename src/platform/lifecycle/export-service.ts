/**
 * Export / import service — serializes app bundles to gzipped JSON (.novo format).
 */

import { Pool, PoolClient } from 'pg';
import { createGzip, createGunzip } from 'zlib';
import { pipeline } from 'stream/promises';
import { Readable, Writable, PassThrough } from 'stream';
import { assembleBundle } from './bundle-assembler';
import type { AppBundle } from './types';
import type { ImportOptions as PkgImportOptions, AppBundle as PkgBundle } from '../packaging/types';

async function withClient<T>(
  pgPool: Pool | PoolClient,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  if ('connect' in pgPool && typeof (pgPool as Pool).connect === 'function') {
    const client = await (pgPool as Pool).connect();
    try {
      return await fn(client);
    } finally {
      client.release();
    }
  }
  return fn(pgPool as PoolClient);
}

async function gzipString(input: string): Promise<Buffer> {
  const chunks: Buffer[] = [];
  const src = Readable.from([Buffer.from(input, 'utf8')]);
  const gz = createGzip();
  const sink = new Writable({
    write(chunk: Buffer, _enc: string, cb: () => void) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string));
      cb();
    },
  });
  await pipeline(src, gz, sink);
  return Buffer.concat(chunks);
}

async function gunzipBuffer(input: Buffer): Promise<string> {
  const chunks: Buffer[] = [];
  const src = Readable.from([input]);
  const gunzip = createGunzip();
  const pt = new PassThrough();
  pt.on('data', (chunk: Buffer) => chunks.push(chunk));
  await pipeline(src, gunzip, pt);
  return Buffer.concat(chunks).toString('utf8');
}

function validateBundle(raw: unknown): asserts raw is AppBundle {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('Invalid bundle: not an object');
  }
  const b = raw as Record<string, unknown>;
  if (b['schemaVersion'] !== '1.0') {
    throw new Error('Unsupported bundle schemaVersion: ' + String(b['schemaVersion']));
  }
  if (!b['app'] || typeof b['app'] !== 'object') {
    throw new Error('Invalid bundle: missing app section');
  }
}

export async function exportApp(
  appId: string,
  pgPool: Pool | PoolClient,
  exportedBy?: string,
): Promise<Buffer> {
  return withClient(pgPool, async (client) => {
    const bundle = await assembleBundle(appId, client, undefined, exportedBy);
    const json = JSON.stringify(bundle, null, 2);
    return gzipString(json);
  });
}

export interface ImportAppOptions {
  newAppName?: string;
  skipConflicts?: boolean;
}

export interface ImportAppResult {
  appId: string;
  warnings: string[];
}

export async function importApp(
  bundleBuffer: Buffer,
  targetTenantSlug: string,
  userId: string,
  pgPool: Pool | PoolClient,
  options?: ImportAppOptions,
): Promise<ImportAppResult> {
  const json = await gunzipBuffer(bundleBuffer);
  const raw: unknown = JSON.parse(json);
  validateBundle(raw);
  const bundle = raw as AppBundle;

  return withClient(pgPool, async (client) => {
    const warnings: string[] = [];
    const { importApp: pkgImportApp } = await import('../packaging/importer');

    const pkgBundle: PkgBundle = {
      version: '1.0',
      exportedAt: bundle.exportedAt,
      exportedBy: userId,
      app: {
        name: options?.newAppName ?? bundle.app.name,
        slug: (options?.newAppName ?? bundle.app.name)
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-'),
        icon: bundle.app.icon,
        description: bundle.app.description,
      },
      schema: bundle.schema as PkgBundle['schema'],
      ui: bundle.ui as PkgBundle['ui'],
      logic: bundle.logic as PkgBundle['logic'],
      scripts: bundle.scripts as unknown as PkgBundle['scripts'],
      integrations: bundle.integrations as PkgBundle['integrations'],
    };

    const pkgOptions: PkgImportOptions = {
      targetTenantSlug,
      newAppName: options?.newAppName,
      mergeMode: options?.skipConflicts ? 'skip' : 'replace',
    };

    const result = await pkgImportApp(pkgBundle, pkgOptions, client);

    return {
      appId: result.appId,
      warnings: [...warnings, ...(result.warnings ?? [])],
    };
  });
}
