/**
 * GET  /api/builder/apps/[appId]/integrations/secrets — list secret names
 * POST /api/builder/apps/[appId]/integrations/secrets — set (upsert) a secret
 * DELETE /api/builder/apps/[appId]/integrations/secrets?name=... — remove a secret
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { z } from 'zod';
import { setSecret, getSecret as getSecretValue, listSecrets, deleteSecret } from '@/platform/integrations/secrets';

interface RouteContext {
  params: Promise<{ appId: string }>;
}

const SetSecretBody = z.object({
  tenantSlug: z.string().min(1),
  name: z.string().min(1).max(128),
  value: z.string().min(1),
});

export async function GET(
  req: NextRequest,
  ctx: RouteContext,
): Promise<NextResponse> {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { appId } = await ctx.params;
  const tenantSlug = req.nextUrl.searchParams.get('tenantSlug') ?? '';
  if (!tenantSlug) return NextResponse.json({ error: 'tenantSlug required' }, { status: 400 });

  const secrets = await listSecrets(appId, tenantSlug);
  return NextResponse.json({ secrets });
}

export async function POST(
  req: NextRequest,
  ctx: RouteContext,
): Promise<NextResponse> {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { appId } = await ctx.params;
  const body = SetSecretBody.safeParse(await req.json());
  if (!body.success) return NextResponse.json({ error: body.error.flatten() }, { status: 400 });

  const { tenantSlug, name, value } = body.data;
  await setSecret(appId, tenantSlug, name, value);
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  req: NextRequest,
  ctx: RouteContext,
): Promise<NextResponse> {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { appId } = await ctx.params;
  const tenantSlug = req.nextUrl.searchParams.get('tenantSlug') ?? '';
  const name = req.nextUrl.searchParams.get('name') ?? '';
  if (!tenantSlug || !name) return NextResponse.json({ error: 'tenantSlug and name required' }, { status: 400 });

  await deleteSecret(appId, tenantSlug, name);
  return NextResponse.json({ ok: true });
}
