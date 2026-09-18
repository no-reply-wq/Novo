import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { prisma } from '@/lib/db/client';
import { hashPassword } from '@/lib/auth/password';

async function requirePlatformAdmin() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.isPlatformAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return null;
}

export async function GET() {
  const deny = await requirePlatformAdmin();
  if (deny) return deny;

  const admins = await prisma.platformAdmin.findMany({
    select: { id: true, name: true, email: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  });

  return NextResponse.json({ admins });
}

export async function POST(req: NextRequest) {
  const deny = await requirePlatformAdmin();
  if (deny) return deny;

  const { name, email, password } = await req.json().catch(() => ({}));

  if (!name || !email || !password) {
    return NextResponse.json({ error: 'Name, email and password are required' }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 });
  }

  const existing = await prisma.platformAdmin.findFirst({ where: { email } });
  if (existing) {
    return NextResponse.json({ error: 'Email already in use' }, { status: 409 });
  }

  const passwordHash = await hashPassword(password);
  const admin = await prisma.platformAdmin.create({
    data: { name, email, passwordHash },
    select: { id: true, name: true, email: true, createdAt: true },
  });

  return NextResponse.json({ admin }, { status: 201 });
}