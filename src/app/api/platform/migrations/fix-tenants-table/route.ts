import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { pgPool } from '@/lib/db/client';

export async function POST(req: NextRequest) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token?.isPlatformAdmin) {
    return NextResponse.json({ error: 'Platform admin only' }, { status: 403 });
  }
  const client = await pgPool.connect();
  try {
    await client.query(`ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ`);
    return NextResponse.json({ success: true });
  } catch(e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  } finally {
    client.release();
  }
}
