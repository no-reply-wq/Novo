/**
 * GET  /api/builder/apps/[appId]/email-templates  — list templates for app
 * POST /api/builder/apps/[appId]/email-templates  — create template
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { pgPool } from '@/lib/db/client';
import { z } from 'zod';

interface RouteContext {
  params: Promise<{ appId: string }>;
}

const CreateTemplateSchema = z.object({
  name: z.string().min(1).max(200),
  subject: z.string().min(1),
  bodyHtml: z.string().min(1),
  bodyText: z.string().optional(),
});

interface TemplateRow {
  id: string;
  app_id: string;
  name: string;
  subject: string;
  body_html: string;
  body_text: string | null;
  created_at: Date;
  updated_at: Date;
}

function rowToTemplate(row: TemplateRow) {
  return {
    id: row.id,
    appId: row.app_id,
    name: row.name,
    subject: row.subject,
    bodyHtml: row.body_html,
    bodyText: row.body_text ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function GET(
  _req: NextRequest,
  ctx: RouteContext,
): Promise<NextResponse> {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { appId } = await ctx.params;

  const result = await pgPool.query<TemplateRow>(
    `SELECT id, app_id, name, subject, body_html, body_text, created_at, updated_at
     FROM platform.email_templates
     WHERE app_id = $1
     ORDER BY name ASC`,
    [appId],
  );

  return NextResponse.json({ templates: result.rows.map(rowToTemplate) }, { status: 200 });
}

export async function POST(
  req: NextRequest,
  ctx: RouteContext,
): Promise<NextResponse> {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { appId } = await ctx.params;

  const body: unknown = await req.json();
  const parsed = CreateTemplateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { name, subject, bodyHtml, bodyText } = parsed.data;

  const result = await pgPool.query<{ id: string }>(
    `INSERT INTO platform.email_templates (app_id, name, subject, body_html, body_text)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [appId, name, subject, bodyHtml, bodyText ?? null],
  );

  return NextResponse.json({ id: result.rows[0].id }, { status: 201 });
}
