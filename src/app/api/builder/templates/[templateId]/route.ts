/**
 * GET /api/builder/templates/[templateId]
 * Returns one template including its full AppBundle.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getTemplate } from '@/platform/templates';

type Params = Promise<{ templateId: string }>;

export async function GET(
  _req: NextRequest,
  { params }: { params: Params },
) {
  const { templateId } = await params;
  const template = getTemplate(templateId);

  if (!template) {
    return NextResponse.json({ error: 'Template not found' }, { status: 404 });
  }

  return NextResponse.json({ template });
}
