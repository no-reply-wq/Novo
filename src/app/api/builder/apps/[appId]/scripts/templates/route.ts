import { NextRequest, NextResponse } from 'next/server';
import { SCRIPT_TEMPLATES } from '@/platform/scripts/library';

export async function GET(_req: NextRequest) {
  return NextResponse.json({ templates: SCRIPT_TEMPLATES });
}
