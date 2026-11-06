/**
 * GET  /api/runtime/[tenantSlug]/tables/[tableId]/records/[recordId]/nested
 * POST /api/runtime/[tenantSlug]/tables/[tableId]/records/[recordId]/nested
 *
 * Fetch or save a record with all its nested children.
 */

import { NextRequest, NextResponse } from 'next/server';
import { tenantQuery } from '@/lib/db/client';
import {
  fetchRecordWithChildren,
  type FetchOptions,
} from '@/platform/data/nested-fetcher';
import {
  saveRecordWithChildren,
  type RecordWithChildrenInput,
  type SaveOptions,
} from '@/platform/data/nested-saver';
import { rowToChildTableConfig, type ChildTableConfigRow } from '@/platform/data/child-tables';
import { createPool, tenantSchemaName } from '@/platform/data/client';
import type { RlsClaims } from '@/platform/data/client';
import type { ChildTableConfig } from '@/platform/data/child-tables';

type Params = { tenantSlug: string; tableId: string; recordId: string };

function getPool() {
  return createPool(process.env.DATABASE_URL);
}

function claimsFromRequest(_req: NextRequest): RlsClaims {
  // In a real auth setup this would decode the JWT / session.
  // For now we build from env / fixed dev user so type is satisfied.
  return {
    userId: process.env.DEV_USER_ID ?? 'system',
    roles: ['admin'],
    locations: [],
  };
}

async function loadChildConfigs(
  schemaName: string,
  rootTableId: string,
): Promise<Map<string, ChildTableConfig[]>> {
  // Load all child table configs reachable from rootTableId recursively.
  // We load all at once and group client-side for simplicity.
  const result = await tenantQuery<ChildTableConfigRow>(
    schemaName,
    `SELECT * FROM platform.child_table_configs`,
  );

  const map = new Map<string, ChildTableConfig[]>();
  for (const row of result.rows) {
    const cfg = rowToChildTableConfig(row);
    const list = map.get(cfg.parentTableId) ?? [];
    list.push(cfg);
    map.set(cfg.parentTableId, list);
  }

  // Ensure the root is present even if it has no children
  if (!map.has(rootTableId)) map.set(rootTableId, []);

  return map;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<Params> },
): Promise<NextResponse> {
  const { tenantSlug, tableId, recordId } = await params;
  const schemaName = tenantSchemaName(tenantSlug);
  const pool = getPool();
  const claims = claimsFromRequest(req);

  try {
    const childConfigs = await loadChildConfigs(schemaName, tableId);
    const maxDepthParam = new URL(req.url).searchParams.get('depth');
    const maxDepth = maxDepthParam ? parseInt(maxDepthParam, 10) : undefined;

    const opts: FetchOptions = { pool, claims, childConfigs, maxDepth };
    const record = await fetchRecordWithChildren(tenantSlug, tableId, recordId, opts);
    return NextResponse.json(record);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    if (message.includes('not found')) {
      return NextResponse.json({ error: message }, { status: 404 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  } finally {
    await pool.end();
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<Params> },
): Promise<NextResponse> {
  const { tenantSlug, tableId, recordId } = await params;
  const pool = getPool();
  const claims = claimsFromRequest(req);

  try {
    const body = (await req.json()) as RecordWithChildrenInput;
    // Ensure the record ID from the URL is reflected in the body
    if (!body.id) body.id = recordId === 'new' ? undefined : recordId;

    const opts: SaveOptions = { pool, claims };
    const saved = await saveRecordWithChildren(tenantSlug, tableId, body, opts);
    return NextResponse.json(saved, { status: recordId === 'new' ? 201 : 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    if (message.includes('restrict')) {
      return NextResponse.json({ error: message }, { status: 409 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  } finally {
    await pool.end();
  }
}

