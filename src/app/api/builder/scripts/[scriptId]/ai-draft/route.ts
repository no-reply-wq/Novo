/**
 * Script AI Draft API
 * POST /api/builder/scripts/[scriptId]/ai-draft
 * { description, tableSchema }
 * → { code, explanation }
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { pgPool } from '@/lib/db/client';
import { z } from 'zod';
import {
  draftScript,
  NotConfiguredError,
  SCRIPT_SDK_REFERENCE,
} from '@/platform/scripts/ai-assistant';
import type { TableSchemaField } from '@/platform/scripts/ai-assistant';

const TableSchemaFieldSchema = z.object({
  name: z.string().min(1),
  type: z.string().min(1),
  label: z.string().optional(),
  required: z.boolean().optional(),
});

const RequestSchema = z.object({
  description: z.string().min(1).max(2000),
  tableSchema: z.object({
    name: z.string().min(1),
    fields: z.array(TableSchemaFieldSchema),
  }),
});

interface ScriptRow {
  id: string;
  app_id: string;
  name: string;
}

interface AppRow {
  tenant_slug: string;
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ scriptId: string }> },
): Promise<NextResponse> {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const tenantSlug =
    (session.user as { tenantSlug?: string }).tenantSlug ?? '';
  if (!tenantSlug) {
    return NextResponse.json({ error: 'No tenant in session' }, { status: 403 });
  }

  const { scriptId } = await context.params;

  // Verify the script belongs to this tenant
  const scriptRes = await pgPool.query<ScriptRow>(
    `SELECT s.id, s.app_id, s.name
     FROM platform.scripts s
     JOIN public.apps a ON a.id = s.app_id
     WHERE s.id = $1 AND a.tenant_slug = $2`,
    [scriptId, tenantSlug],
  );

  if (scriptRes.rowCount === 0) {
    return NextResponse.json({ error: 'Script not found' }, { status: 404 });
  }

  const body = await req.json().catch(() => ({})) as unknown;
  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });
  }

  const { description, tableSchema } = parsed.data;

  // Look up app to verify tenant membership
  const appRes = await pgPool.query<AppRow>(
    `SELECT tenant_slug FROM public.apps WHERE id = $1 AND tenant_slug = $2`,
    [scriptRes.rows[0].app_id, tenantSlug],
  );

  if (appRes.rowCount === 0) {
    return NextResponse.json({ error: 'App not found' }, { status: 404 });
  }

  try {
    const result = await draftScript({
      description,
      tableSchema: {
        name: tableSchema.name,
        fields: tableSchema.fields as TableSchemaField[],
      },
      sdkReference: SCRIPT_SDK_REFERENCE,
    });

    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof NotConfiguredError) {
      return NextResponse.json(
        { error: 'AI assistant is not configured. Set ANTHROPIC_API_KEY.' },
        { status: 503 },
      );
    }
    throw err;
  }
}
