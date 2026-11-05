import { amountInWords, buildHtml } from '../renderer';
import type { PdfTemplate } from '../types';

// ─── amountInWords tests ──────────────────────────────────────────────────────

describe('amountInWords', () => {
  it('converts a simple integer', () => {
    expect(amountInWords(100)).toBe('One Hundred Rupees Only');
  });

  it('converts rupees and paise', () => {
    expect(amountInWords(12345.5)).toBe(
      'Twelve Thousand Three Hundred Forty Five Rupees and Fifty Paise Only',
    );
  });

  it('converts zero', () => {
    expect(amountInWords(0)).toBe('Zero Rupees Only');
  });

  it('converts crore + lakh + thousand', () => {
    const result = amountInWords(10_050_001);
    expect(result).toContain('Crore');
    expect(result).toContain('Fifty Thousand');
    expect(result).toContain('One Rupees');
  });

  it('rounds to 2 decimal places', () => {
    expect(amountInWords(1.999)).toContain('Two Rupees');
  });

  it('handles paise only', () => {
    expect(amountInWords(0.75)).toBe('Zero Rupees and Seventy Five Paise Only');
  });

  it('throws for negative amounts', () => {
    expect(() => amountInWords(-1)).toThrow(RangeError);
  });

  it('handles large lakh amounts', () => {
    const result = amountInWords(500000);
    expect(result).toContain('Five Lakh');
    expect(result).toBe('Five Lakh Rupees Only');
  });

  it('converts 1 rupee', () => {
    expect(amountInWords(1)).toBe('One Rupees Only');
  });

  it('converts 19 rupees', () => {
    expect(amountInWords(19)).toBe('Nineteen Rupees Only');
  });

  it('converts 20 rupees', () => {
    expect(amountInWords(20)).toBe('Twenty Rupees Only');
  });

  it('converts 99 paise', () => {
    expect(amountInWords(0.99)).toContain('Ninety Nine Paise');
  });
});

// ─── buildHtml tests ──────────────────────────────────────────────────────────

function makeTemplate(overrides: Partial<PdfTemplate> = {}): PdfTemplate {
  return {
    id: 'tpl-1',
    tenantSlug: 'test',
    name: 'Test Template',
    tableId: 'orders',
    layout: {},
    blocks: [],
    pageSize: 'A4',
    orientation: 'portrait',
    margins: { top: 10, right: 10, bottom: 10, left: 10 },
    ...overrides,
  };
}

describe('buildHtml', () => {
  it('produces valid HTML structure', () => {
    const html = buildHtml({
      template: makeTemplate(),
      record: {},
      childRecords: {},
    });
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('<html');
    expect(html).toContain('</html>');
  });

  it('substitutes field bindings in text blocks', () => {
    const template = makeTemplate({
      blocks: [
        {
          type: 'text',
          content: 'Invoice #{{ invoiceNumber }}',
          style: {},
          position: { x: 0, y: 0, width: 200, height: 20 },
        },
      ],
    });
    const html = buildHtml({
      template,
      record: { invoiceNumber: 'INV-001' },
      childRecords: {},
    });
    expect(html).toContain('Invoice #INV-001');
  });

  it('leaves unbound fields empty', () => {
    const template = makeTemplate({
      blocks: [
        {
          type: 'text',
          content: 'Hello {{ missing }}!',
          style: {},
          position: { x: 0, y: 0, width: 200, height: 20 },
        },
      ],
    });
    const html = buildHtml({
      template,
      record: {},
      childRecords: {},
    });
    expect(html).toContain('Hello !');
  });

  it('renders table block with rows', () => {
    const template = makeTemplate({
      blocks: [
        {
          type: 'table',
          relationField: 'lineItems',
          columns: [
            { field: 'item', label: 'Item', type: 'text' },
            { field: 'qty', label: 'Qty', type: 'number' },
            { field: 'price', label: 'Price', type: 'currency' },
          ],
          showTotals: false,
          style: {},
          position: { x: 0, y: 50, width: 500, height: 200 },
        },
      ],
    });
    const html = buildHtml({
      template,
      record: {},
      childRecords: {
        lineItems: [
          { item: 'Widget A', qty: 2, price: 100 },
          { item: 'Widget B', qty: 1, price: 50 },
        ],
      },
    });
    expect(html).toContain('Widget A');
    expect(html).toContain('Widget B');
    expect(html).toContain('₹100.00');
  });

  it('renders totals row when showTotals is true', () => {
    const template = makeTemplate({
      blocks: [
        {
          type: 'table',
          relationField: 'items',
          columns: [
            { field: 'name', label: 'Name', type: 'text' },
            { field: 'amount', label: 'Amount', type: 'currency' },
          ],
          showTotals: true,
          style: {},
          position: { x: 0, y: 0, width: 400, height: 300 },
        },
      ],
    });
    const html = buildHtml({
      template,
      record: {},
      childRecords: {
        items: [
          { name: 'A', amount: 100 },
          { name: 'B', amount: 200 },
        ],
      },
    });
    expect(html).toContain('Total');
    expect(html).toContain('₹300.00');
  });

  it('renders header/footer blocks in separate sections', () => {
    const template = makeTemplate({
      blocks: [
        {
          type: 'header-footer',
          area: 'header',
          content: 'Company Name',
          style: {},
          position: { x: 0, y: 0, width: 500, height: 30 },
        },
        {
          type: 'header-footer',
          area: 'footer',
          content: 'Page 1',
          style: {},
          position: { x: 0, y: 0, width: 500, height: 20 },
        },
      ],
    });
    const html = buildHtml({ template, record: {}, childRecords: {} });
    expect(html).toContain('Company Name');
    expect(html).toContain('Page 1');
    expect(html).toContain('class="header"');
    expect(html).toContain('class="footer"');
  });

  it('escapes HTML special characters in field values', () => {
    const template = makeTemplate({
      blocks: [
        {
          type: 'text',
          content: '{{ note }}',
          style: {},
          position: { x: 0, y: 0, width: 200, height: 20 },
        },
      ],
    });
    const html = buildHtml({
      template,
      record: { note: '<script>alert("xss")</script>' },
      childRecords: {},
    });
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('renders landscape orientation', () => {
    const template = makeTemplate({ orientation: 'landscape', pageSize: 'A4' });
    const html = buildHtml({ template, record: {}, childRecords: {} });
    // Landscape swaps width/height
    expect(html).toContain('297mm');
  });
});
