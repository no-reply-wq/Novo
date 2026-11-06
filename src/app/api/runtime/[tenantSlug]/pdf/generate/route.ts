import { NextRequest, NextResponse } from 'next/server';
import type { PDFTemplate } from '@/platform/pdf/types';
import { generatePDF } from '@/platform/pdf/generator';
import type { PDFRenderData } from '@/platform/pdf/html-renderer';

interface GenerateRequestBody {
  templateId: string;
  recordId: string;
  tableId: string;
  record?: Record<string, unknown>;
  lines?: Record<string, unknown>[];
}

// In a real implementation this would query the database for template + record data
// Using a stub template store here; production would fetch from platform.pdf_templates
const templateStore = new Map<string, PDFTemplate>();

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ tenantSlug: string }> }
) {
  const { tenantSlug } = await params;
  const body = (await req.json()) as GenerateRequestBody;
  const { templateId, recordId, tableId, record, lines } = body;

  if (!templateId || !recordId || !tableId) {
    return NextResponse.json(
      { error: 'templateId, recordId, and tableId are required' },
      { status: 400 }
    );
  }

  // Fetch template (in production: query platform.pdf_templates)
  const template = templateStore.get(templateId);
  if (!template) {
    return NextResponse.json({ error: 'Template not found' }, { status: 404 });
  }

  const data: PDFRenderData = {
    record: record ?? {},
    lines: lines ?? [],
    tenant: {
      name: tenantSlug,
      gstin: undefined,
      address: undefined,
    },
  };

  try {
    const pdfBuffer = await generatePDF(template, data);
    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="document-${recordId}.pdf"`,
        'Content-Length': String(pdfBuffer.length),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'PDF generation failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
