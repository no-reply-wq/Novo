/**
 * GET /api/marketplace/templates/[slug]
 * Get full template details including the package definition.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getTemplateBySlug } from '@/platform/marketplace';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const template = getTemplateBySlug(slug);

  if (!template) {
    return NextResponse.json({ error: 'Template not found' }, { status: 404 });
  }

  return NextResponse.json({ template });
}
