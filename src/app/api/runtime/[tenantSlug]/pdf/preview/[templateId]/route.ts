import { NextRequest, NextResponse } from 'next/server';
import type { PDFTemplate } from '@/platform/pdf/types';
import { renderPDFTemplate } from '@/platform/pdf/html-renderer';

// In production: fetch from platform.pdf_templates table
const templateStore = new Map<string, PDFTemplate>();

const SAMPLE_DATA = {
  record: {
    id: 'SAMPLE-001',
    invoice_number: 'INV-2024-001',
    buyer_name: 'Sample Customer Pvt Ltd',
    buyer_gstin: '29AABCT1332L1ZT',
    date: new Date().toLocaleDateString('en-IN'),
    total: 11800,
    notes: 'Thank you for your business.',
  },
  lines: [
    { description: 'Product A', qty: 2, rate: 5000, taxable_amount: 10000, gst_amount: 1800, amount: 11800 },
  ],
  tenant: {
    name: 'Demo Company Pvt Ltd',
    gstin: '27AABCT1332L1ZK',
    address: '123 Business Park, Mumbai, Maharashtra 400001',
  },
};

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ tenantSlug: string; templateId: string }> }
) {
  const { templateId } = await params;

  const template = templateStore.get(templateId);
  if (!template) {
    return NextResponse.json({ error: 'Template not found' }, { status: 404 });
  }

  const html = renderPDFTemplate(template, SAMPLE_DATA);
  return new NextResponse(html, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}
