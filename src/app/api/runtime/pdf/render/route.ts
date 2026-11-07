/**
 * POST /api/runtime/pdf/render
 *
 * Renders an HTML string to PDF. Strategy:
 *   1. Gotenberg HTTP API if GOTENBERG_URL is set
 *   2. Playwright fallback
 *
 * Body: { html: string, options?: { margin?, format? } }
 * Returns: application/pdf binary
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { renderHtmlToPdf } from '@/platform/integrations/pdf-renderer';

export async function POST(req: NextRequest): Promise<NextResponse> {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { html?: string; options?: { margin?: { top: string; bottom: string; left: string; right: string }; format?: 'A4' | 'Letter' } };
  try {
    body = await req.json() as typeof body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!body.html || typeof body.html !== 'string') {
    return NextResponse.json({ error: 'html is required' }, { status: 400 });
  }

  const pdfBuffer = await renderHtmlToPdf(body.html, body.options);

  return new NextResponse(new Uint8Array(pdfBuffer), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'inline; filename="document.pdf"',
      'Content-Length': String(pdfBuffer.length),
    },
  });
}
