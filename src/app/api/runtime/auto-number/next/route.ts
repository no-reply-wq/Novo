/**
 * POST /api/runtime/auto-number/next
 *
 * Get the next auto-number for a given table + field.
 *
 * Request body:
 * {
 *   tableId:      string,  // stable UUID of the table
 *   fieldId:      string,  // stable UUID of the auto_number field
 *   options:      AutoNumberOptions,
 *   locationCode?: string, // optional location code for {LOC} token
 * }
 *
 * Response:
 * { value: string }  // e.g. "INV-2026-MUM-0001"
 *
 * Uses SELECT … FOR UPDATE inside a transaction for atomic increment.
 * Must be called from a trusted server context — not exposed to end users directly.
 */

import { NextRequest, NextResponse } from 'next/server';
import { pgPool } from '@/lib/db/client';
import { nextAutoNumberFormatted } from '@/platform/data/auto-number';
import type { AutoNumberOptions } from '@/platform/contracts';
import { requirePermission } from '@/lib/auth/tenant-session';
import { MODULE } from '@/lib/auth/modules';

interface RequestBody {
  tableId: string;
  fieldId: string;
  options: AutoNumberOptions;
  locationCode?: string;
  tenant: string;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { tableId, fieldId, options, locationCode, tenant } = body;

  if (!tenant) {
    return NextResponse.json({ error: 'tenant is required' }, { status: 400 });
  }
  if (!tableId || !fieldId) {
    return NextResponse.json({ error: 'tableId and fieldId are required' }, { status: 400 });
  }
  if (!options || typeof options !== 'object') {
    return NextResponse.json({ error: 'options is required' }, { status: 400 });
  }

  // Require edit permission on the rows module
  const ctx = await requirePermission(tenant, MODULE.ROWS, 'edit');
  if (ctx instanceof NextResponse) return ctx;

  const client = await pgPool.connect();
  try {
    await client.query('BEGIN');

    const value = await nextAutoNumberFormatted(
      client,
      tableId,
      fieldId,
      options,
      locationCode,
      new Date(),
    );

    await client.query('COMMIT');
    return NextResponse.json({ value });
  } catch (err) {
    await client.query('ROLLBACK');
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  } finally {
    client.release();
  }
}
