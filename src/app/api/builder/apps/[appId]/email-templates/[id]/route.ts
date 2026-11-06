/**
 * GET    /api/builder/apps/[appId]/email-templates/[id]
 * PUT    /api/builder/apps/[appId]/email-templates/[id]
 * DELETE /api/builder/apps/[appId]/email-templates/[id]
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { pgPool } from '@/lib/db/client';
import { z } from 'zod';

interface RouteContext {
  params: Promise<{ appId: string; id: string }>;
}

const UpdateTemplateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  subject: z.string().min(1).optional(),
  bodyHtml: z.string().min(1).optional(),
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

  const { appId, id } = await ctx.params;

  const result = await pgPool.query<TemplateRow>(
    `SELECT id, app_id, name, subject, body_html, body_text, created_at, updated_at
     FROM platform.email_templates
     WHERE id = $1 AND app_id = $2`,
    [id, appId],
  );

  if (result.rows.length === 0) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  return NextResponse.json(rowToTemplate(result.rows[0]), { status: 200 });
}

export async function PUT(
  req: NextRequest,
  ctx: RouteContext,
): Promise<NextResponse> {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { appId, id } = await ctx.params;

  const body: unknown = await req.json();
  const parsed = UpdateTemplateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { name, subject, bodyHtml, bodyText } = parsed.data;

  const setClauses: string[] = ['updated_at = now()'];
  const values: unknown[] = [];
  let idx = 1;

  if (name !== undefined) { setClauses.push(`name = $${idx}`); values.push(name); idx++; }
  if (subject !== undefined) { setClauses.push(`subject = $${idx}`); values.push(subject); idx++; }
  if (bodyHtml !== undefined) { setClauses.push(`body_html = $${idx}`); values.push(bodyHtml); idx++; }
  if (bodyText !== undefined) { setClauses.push(`body_text = $${idx}`); values.push(bodyText); idx++; }

  values.push(id, appId);

  const result = await pgPool.query<{ id: string }>(
    `UPDATE platform.email_templates
     SET ${setClauses.join(', ')}
     WHERE id = $${idx} AND app_id = $${idx + 1}
     RETURNING id`,
    values,
  );

  if (result.rows.length === 0) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}

export async function DELETE(
  _req: NextRequest,
  ctx: RouteContext,
): Promise<NextResponse> {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { appId, id } = await ctx.params;

  const result = await pgPool.query<{ id: string }>(
    `DELETE FROM platform.email_templates
     WHERE id = $1 AND app_id = $2
     RETURNING id`,
    [id, appId],
  );

  if (result.rows.length === 0) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}
