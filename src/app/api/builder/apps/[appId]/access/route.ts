/**
 * src/app/api/builder/apps/[appId]/access/route.ts
 *
 * GET  /api/builder/apps/[appId]/access
 *   Returns all RLS policies and field permissions for the app.
 *
 * POST /api/builder/apps/[appId]/access
 *   Saves policies and field permissions for a table, then immediately
 *   applies the DDL to the tenant's Postgres schema.
 *
 * Body: {
 *   tableApiKey:      string
 *   tenantSlug:       string   // needed to locate the tenant schema
 *   policies: Array<{
 *     roleId:    string
 *     operation: 'select'|'insert'|'update'|'delete'|'all'
 *     expr:      string
 *   }>
 *   fieldPermissions: Array<{
 *     fieldApiKey: string
 *     roleId:      string
 *     permission:  'read_write'|'read_only'|'hidden'
 *   }>
 * }
 */

import { NextRequest, NextResponse } from 'next/server';
import { Pool } from 'pg';
import { savePolicies, loadAllPoliciesForApp } from '@/platform/access/policy-store';
import { saveFieldPermissions, loadFieldPermissions } from '@/platform/access/field-permissions-store';
import { applyPoliciesForTable } from '@/platform/access/policy-applier';

// Use the platform DB pool.
// In production this would come from a shared pool factory; for now we
// use env vars consistent with the rest of the builder API.
function getPlatformPool(): Pool {
  const connectionString = process.env.PLATFORM_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('PLATFORM_DATABASE_URL or DATABASE_URL env var is required');
  }
  return new Pool({ connectionString });
}

// Lazy singleton pool — avoids creating a new pool on every request
let _pool: Pool | null = null;
function getPool(): Pool {
  if (!_pool) _pool = getPlatformPool();
  return _pool;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ appId: string }> },
) {
  const { appId } = await params;
  const client = await getPool().connect();
  try {
    const policies = await loadAllPoliciesForApp(client, appId);
    // Group field permissions by tableApiKey for convenience
    const tableKeys = [...new Set(policies.map((p) => p.tableApiKey))];
    const fieldPermsByTable: Record<string, Record<string, Record<string, string>>> = {};
    for (const tableApiKey of tableKeys) {
      fieldPermsByTable[tableApiKey] = await loadFieldPermissions(client, appId, tableApiKey);
    }

    return NextResponse.json({ policies, fieldPermissions: fieldPermsByTable });
  } catch (err) {
    console.error('[access/GET]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500 },
    );
  } finally {
    client.release();
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ appId: string }> },
) {
  const { appId } = await params;

  let body: {
    tableApiKey: string;
    tenantSlug: string;
    policies: Array<{ roleId: string; operation: string; expr: string }>;
    fieldPermissions: Array<{ fieldApiKey: string; roleId: string; permission: string }>;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { tableApiKey, tenantSlug, policies, fieldPermissions } = body;

  if (!tableApiKey || typeof tableApiKey !== 'string') {
    return NextResponse.json({ error: 'tableApiKey is required' }, { status: 400 });
  }
  if (!tenantSlug || typeof tenantSlug !== 'string') {
    return NextResponse.json({ error: 'tenantSlug is required' }, { status: 400 });
  }

  const client = await getPool().connect();
  try {
    // Persist policies
    const savedPolicies = await savePolicies(
      client,
      appId,
      tableApiKey,
      (policies ?? []).map((p) => ({
        roleId: p.roleId,
        operation: p.operation as 'select' | 'insert' | 'update' | 'delete' | 'all',
        expr: p.expr ?? '',
      })),
    );

    // Persist field permissions
    const savedFp = await saveFieldPermissions(
      client,
      appId,
      tableApiKey,
      (fieldPermissions ?? []).map((fp) => ({
        fieldApiKey: fp.fieldApiKey,
        roleId: fp.roleId,
        permission: fp.permission as 'read_write' | 'read_only' | 'hidden',
      })),
    );

    // Apply DDL immediately
    let applyResult: { applied: number; errors: string[] } = { applied: 0, errors: [] };
    try {
      applyResult = await applyPoliciesForTable(client, appId, tenantSlug, tableApiKey);
    } catch (applyErr) {
      // DDL apply failure is non-fatal for the save — log but continue
      console.error('[access/POST] DDL apply error:', applyErr);
      applyResult.errors.push(
        applyErr instanceof Error ? applyErr.message : String(applyErr),
      );
    }

    return NextResponse.json({
      ok: true,
      savedPolicies: savedPolicies.length,
      savedFieldPermissions: savedFp.length,
      rlsApplied: applyResult.applied,
      rlsErrors: applyResult.errors,
    });
  } catch (err) {
    console.error('[access/POST]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500 },
    );
  } finally {
    client.release();
  }
}
