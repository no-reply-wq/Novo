/**
 * DELETE /api/platform/admins/[adminId] — remove a platform admin
 */
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { prisma } from '@/lib/db/client';

type Params = { params: Promise<{ adminId: string }> };

async function requirePlatformAdmin() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.isPlatformAdmin) return null;
  return session;
}

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await requirePlatformAdmin();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { adminId } = await params;
  const admin = await prisma.platformAdmin.findUnique({
    where: { id: adminId },
    select: { id: true, name: true, email: true, createdAt: true, active: true },
  });
  if (!admin) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ admin });
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await requirePlatformAdmin();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { adminId } = await params;
  const body = await req.json().catch(() => ({}));

  // Prevent self-deactivation
  if (adminId === session.user.id && body.active === false) {
    return NextResponse.json({ error: 'Cannot deactivate your own account' }, { status: 400 });
  }

  const admin = await prisma.platformAdmin.update({
    where: { id: adminId },
    data: { ...(body.name && { name: body.name }), ...(typeof body.active === 'boolean' && { active: body.active }) },
    select: { id: true, name: true, email: true, active: true },
  });
  return NextResponse.json({ admin });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await requirePlatformAdmin();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { adminId } = await params;

  // Prevent self-deletion
  if (adminId === session.user.id) {
    return NextResponse.json({ error: 'Cannot delete your own account' }, { status: 400 });
  }

  const admin = await prisma.platformAdmin.findUnique({ where: { id: adminId } });
  if (!admin) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await prisma.platformAdmin.delete({ where: { id: adminId } });
  return NextResponse.json({ success: true });
}
