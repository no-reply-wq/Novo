/**
 * POST /api/auth/signup
 * Self-service tenant signup.
 * Creates a new tenant + admin user using the same provisionTenant flow
 * that platform admins use, then starts a 14-day trial.
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { pgPool, prisma } from '@/lib/db/client';
import { provisionTenant, tenantSlugToSchemaName } from '@/lib/db/provision-tenant';
import { generateSlug } from '@/lib/utils/slug';
import { v4 as uuid } from 'uuid';

const SignupSchema = z.object({
  companyName: z.string().min(2).max(100),
  name: z.string().min(1).max(100),
  email: z.string().email(),
  password: z
    .string()
    .min(10, 'Password must be at least 10 characters'),
});

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = SignupSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });
  }

  const { companyName, name, email, password } = parsed.data;

  try {
    // Generate a unique slug for the tenant
    const baseSlug = generateSlug(companyName);

    // Check if slug is already taken and append suffix if needed
    let slug = baseSlug;
    const existing = await pgPool.query<{ slug: string }>(
      `SELECT slug FROM public.tenants WHERE slug LIKE $1 ORDER BY created_at DESC LIMIT 10`,
      [`${baseSlug}%`],
    );
    const takenSlugs = new Set(existing.rows.map((r) => r.slug));
    if (takenSlugs.has(slug)) {
      slug = `${baseSlug}-${Date.now().toString(36).slice(-4)}`;
    }

    const schemaName = tenantSlugToSchemaName(slug);
    const tenantId = uuid();
    const trialEndsAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000); // 14 days

    // Create the control-plane tenant record (using Prisma for the TRIAL status)
    await prisma.tenant.create({
      data: {
        id: tenantId,
        name: companyName,
        slug,
        schemaName,
        plan: 'starter',
        seatLimit: 5,
        status: 'TRIAL',
        dbBackend: 'POSTGRES',
      },
    });

    // Provision the tenant schema + admin user
    await provisionTenant({
      tenantId,
      tenantSlug: slug,
      schemaName,
      adminEmail: email.toLowerCase(),
      adminName: name,
      adminPassword: password,
    });

    // Record trial expiry (not on the Prisma model; store in a metadata column if available)
    // Best-effort: ignore if the column doesn't exist yet
    try {
      await pgPool.query(
        `UPDATE public.tenants SET trial_ends_at = $1 WHERE id = $2`,
        [trialEndsAt, tenantId],
      );
    } catch {
      // trial_ends_at column may not exist in older schemas — non-fatal
    }

    return NextResponse.json(
      {
        success: true,
        tenantSlug: slug,
        message:
          'Account created! Your 14-day trial has started. You can now sign in.',
      },
      { status: 201 },
    );
  } catch (err) {
    console.error('[POST /api/auth/signup]', err);
    const msg =
      err instanceof Error ? err.message : 'Failed to create account';
    // Surface duplicate-email error clearly
    if (msg.includes('unique') || msg.includes('duplicate')) {
      return NextResponse.json(
        { error: 'An account with that email already exists.' },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: 'Failed to create account' }, { status: 500 });
  }
}
