import { renderPDFTemplate, formatIndianCurrency, amountInWords } from '../html-renderer';
import type { PDFTemplate, PDFBlock } from '../types';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeTemplate(overrides: Partial<PDFTemplate> = {}): PDFTemplate {
  return {
    id: 'tpl-001',
    appId: 'app-001',
    name: 'Test Invoice',
    pageSize: 'A4',
    orientation: 'portrait',
    margins: { top: 20, right: 15, bottom: 20, left: 15 },
    body: [],
    styles: {},
    ...overrides,
  };
}

const TENANT = {
  name: 'Acme Pvt Ltd',
  gstin: '27AABCT1332L1ZK',
  address: '123 Main St, Mumbai',
  state: '27',
};

const BASE_RECORD: Record<string, unknown> = {
  invoice_number: 'INV-001',
  buyer_name: 'Buyer Co',
  buyer_gstin: '29AABCT1332L1ZT',
  total: 11800,
};

const THREE_LINES = [
  { description: 'Item A', qty: 1, rate: 1000, amount: 1000, gst_amount: 180, taxable_amount: 1000 },
  { description: 'Item B', qty: 2, rate: 500,  amount: 1000, gst_amount: 180, taxable_amount: 1000 },
  { description: 'Item C', qty: 3, rate: 200,  amount: 600,  gst_amount: 108, taxable_amount: 600  },
];

// ─── Indian Currency Formatting ───────────────────────────────────────────────

describe('formatIndianCurrency', () => {
  it('formats 1234567.89 as ₹12,34,567.89', () => {
    expect(formatIndianCurrency(1234567.89)).toBe('₹12,34,567.89');
  });

  it('formats 0 as ₹0.00', () => {
    expect(formatIndianCurrency(0)).toBe('₹0.00');
  });

  it('formats 999 as ₹999.00', () => {
    expect(formatIndianCurrency(999)).toBe('₹999.00');
  });

  it('formats 1000 as ₹1,000.00', () => {
    expect(formatIndianCurrency(1000)).toBe('₹1,000.00');
  });

  it('formats 100000 as ₹1,00,000.00', () => {
    expect(formatIndianCurrency(100000)).toBe('₹1,00,000.00');
  });
});

// ─── Amount in Words ──────────────────────────────────────────────────────────

describe('amountInWords', () => {
  it('converts 1234 to One Thousand Two Hundred Thirty Four Only', () => {
    const result = amountInWords(1234);
    expect(result).toContain('One Thousand');
    expect(result).toContain('Two Hundred');
    expect(result).toContain('Thirty Four');
    expect(result).toContain('Only');
  });

  it('converts 0 to Zero', () => {
    expect(amountInWords(0)).toBe('Zero');
  });

  it('converts 100 to One Hundred Only', () => {
    const result = amountInWords(100);
    expect(result).toContain('One Hundred');
    expect(result).toContain('Only');
  });

  it('converts 1000000 to include Lakh', () => {
    const result = amountInWords(1000000);
    expect(result).toContain('Lakh');
  });

  it('converts 10000000 to include Crore', () => {
    const result = amountInWords(10000000);
    expect(result).toContain('Crore');
  });
});

// ─── Text Block ───────────────────────────────────────────────────────────────

describe('renderPDFTemplate — text block', () => {
  it('renders text with data binding', () => {
    const textBlock: PDFBlock = {
      id: 'b1',
      type: 'text',
      props: { content: 'Invoice: {{record.invoice_number}}' },
    };
    const html = renderPDFTemplate(
      makeTemplate({ body: [textBlock] }),
      { record: BASE_RECORD, tenant: TENANT }
    );
    expect(html).toContain('INV-001');
    expect(html).toContain('<p class="pdf-text"');
  });

  it('returns empty string for missing field (no crash)', () => {
    const textBlock: PDFBlock = {
      id: 'b2',
      type: 'text',
      props: { content: '{{record.nonexistent_field}}' },
    };
    const html = renderPDFTemplate(
      makeTemplate({ body: [textBlock] }),
      { record: {}, tenant: TENANT }
    );
    expect(html).not.toContain('undefined');
    expect(html).not.toContain('null');
    // binding resolves to empty string
    expect(html).toContain('<p class="pdf-text"');
  });
});

// ─── Heading Block ────────────────────────────────────────────────────────────

describe('renderPDFTemplate — heading block', () => {
  it('renders heading at correct level', () => {
    const block: PDFBlock = {
      id: 'h1',
      type: 'heading',
      props: { content: 'Tax Invoice', level: 1 },
    };
    const html = renderPDFTemplate(makeTemplate({ body: [block] }), { record: {}, tenant: TENANT });
    expect(html).toContain('<h1 class="pdf-heading"');
    expect(html).toContain('Tax Invoice');
  });
});

// ─── Line Items Table ─────────────────────────────────────────────────────────

describe('renderPDFTemplate — line items table', () => {
  const lineItemsBlock: PDFBlock = {
    id: 'li1',
    type: 'line_items',
    props: {
      columns: [
        { label: 'Description', field: 'description', format: 'text' },
        { label: 'Qty', field: 'qty', align: 'right', format: 'number' },
        { label: 'Amount', field: 'amount', align: 'right', format: 'currency' },
      ],
      showTotals: true,
    },
  };

  it('renders all 3 rows', () => {
    const html = renderPDFTemplate(
      makeTemplate({ body: [lineItemsBlock] }),
      { record: BASE_RECORD, lines: THREE_LINES, tenant: TENANT }
    );
    expect(html).toContain('Item A');
    expect(html).toContain('Item B');
    expect(html).toContain('Item C');
  });

  it('renders totals row when showTotals is true', () => {
    const html = renderPDFTemplate(
      makeTemplate({ body: [lineItemsBlock] }),
      { record: BASE_RECORD, lines: THREE_LINES, tenant: TENANT }
    );
    expect(html).toContain('class="totals-row"');
  });

  it('renders currency in Indian format', () => {
    const html = renderPDFTemplate(
      makeTemplate({ body: [lineItemsBlock] }),
      { record: BASE_RECORD, lines: THREE_LINES, tenant: TENANT }
    );
    expect(html).toContain('₹');
  });
});

// ─── GST Split Block ──────────────────────────────────────────────────────────

describe('renderPDFTemplate — gstin_block intra-state', () => {
  it('shows CGST and SGST for intra-state (same state code)', () => {
    // Both GSTINs start with 27 (Maharashtra)
    const record = { ...BASE_RECORD, buyer_gstin: '27BBACT9999Q1ZP' };
    const block: PDFBlock = {
      id: 'g1',
      type: 'gstin_block',
      props: {
        showGSTSplit: true,
        supplierFields: { gstin: '{{tenant.gstin}}' },
        buyerFields: { gstin: '{{record.buyer_gstin}}' },
      },
    };
    const html = renderPDFTemplate(
      makeTemplate({ body: [block] }),
      { record, lines: THREE_LINES, tenant: TENANT }
    );
    expect(html).toContain('CGST');
    expect(html).toContain('SGST');
    expect(html).not.toContain('IGST');
  });
});

describe('renderPDFTemplate — gstin_block inter-state', () => {
  it('shows IGST for inter-state (different state codes)', () => {
    // Supplier: 27 (MH), Buyer: 29 (KA)
    const block: PDFBlock = {
      id: 'g2',
      type: 'gstin_block',
      props: {
        showGSTSplit: true,
        supplierFields: { gstin: '{{tenant.gstin}}' },
        buyerFields: { gstin: '{{record.buyer_gstin}}' },
      },
    };
    const html = renderPDFTemplate(
      makeTemplate({ body: [block] }),
      { record: BASE_RECORD, lines: THREE_LINES, tenant: TENANT }
    );
    expect(html).toContain('IGST');
    expect(html).not.toContain('CGST');
    expect(html).not.toContain('SGST');
  });
});

// ─── Amount in Words Block ────────────────────────────────────────────────────

describe('renderPDFTemplate — amount_in_words block', () => {
  it('renders amount in words from record field', () => {
    const block: PDFBlock = {
      id: 'aw1',
      type: 'amount_in_words',
      props: { field: 'total', expression: 'record.total' },
    };
    const html = renderPDFTemplate(
      makeTemplate({ body: [block] }),
      { record: { total: 11800 }, tenant: TENANT }
    );
    expect(html).toContain('Amount in Words');
    expect(html).toContain('Only');
  });
});

// ─── Header and Footer ────────────────────────────────────────────────────────

describe('renderPDFTemplate — header and footer', () => {
  it('includes header blocks in output', () => {
    const headerBlock: PDFBlock = {
      id: 'hdr',
      type: 'text',
      props: { content: 'COMPANY HEADER' },
    };
    const html = renderPDFTemplate(
      makeTemplate({ header: [headerBlock], body: [] }),
      { record: {}, tenant: TENANT }
    );
    expect(html).toContain('page-header');
    expect(html).toContain('COMPANY HEADER');
  });

  it('includes footer blocks in output', () => {
    const footerBlock: PDFBlock = {
      id: 'ftr',
      type: 'text',
      props: { content: 'Page footer text' },
    };
    const html = renderPDFTemplate(
      makeTemplate({ footer: [footerBlock], body: [] }),
      { record: {}, tenant: TENANT }
    );
    expect(html).toContain('page-footer');
    expect(html).toContain('Page footer text');
  });

  it('includes page-number placeholder in footer', () => {
    const footerBlock: PDFBlock = {
      id: 'ftr2',
      type: 'text',
      props: { content: 'Footer' },
    };
    const html = renderPDFTemplate(
      makeTemplate({ footer: [footerBlock], body: [] }),
      { record: {}, tenant: TENANT }
    );
    expect(html).toContain('page-number');
  });
});

// ─── Missing field → empty string ────────────────────────────────────────────

describe('renderPDFTemplate — missing fields', () => {
  it('resolves missing record fields to empty string without throwing', () => {
    const block: PDFBlock = {
      id: 'miss',
      type: 'text',
      props: { content: '{{record.does_not_exist}} hello' },
    };
    expect(() =>
      renderPDFTemplate(makeTemplate({ body: [block] }), { record: {}, tenant: TENANT })
    ).not.toThrow();
  });

  it('outputs empty string for missing binding (not "undefined")', () => {
    const block: PDFBlock = {
      id: 'miss2',
      type: 'text',
      props: { content: '{{record.missing}}' },
    };
    const html = renderPDFTemplate(makeTemplate({ body: [block] }), { record: {}, tenant: TENANT });
    expect(html).not.toContain('undefined');
    expect(html).not.toContain('null');
  });
});

// ─── Divider and Spacer ───────────────────────────────────────────────────────

describe('renderPDFTemplate — divider and spacer', () => {
  it('renders divider hr', () => {
    const block: PDFBlock = { id: 'd1', type: 'divider', props: {} };
    const html = renderPDFTemplate(makeTemplate({ body: [block] }), { record: {}, tenant: TENANT });
    expect(html).toContain('<hr class="pdf-divider"');
  });

  it('renders spacer with height', () => {
    const block: PDFBlock = { id: 's1', type: 'spacer', props: { height: '24px' } };
    const html = renderPDFTemplate(makeTemplate({ body: [block] }), { record: {}, tenant: TENANT });
    expect(html).toContain('height:24px');
  });
});

// ─── Page settings in HTML ────────────────────────────────────────────────────

describe('renderPDFTemplate — page settings', () => {
  it('includes A4 page size in CSS', () => {
    const html = renderPDFTemplate(makeTemplate({ pageSize: 'A4' }), { record: {}, tenant: TENANT });
    expect(html).toContain('210mm');
  });

  it('includes template name in title', () => {
    const html = renderPDFTemplate(makeTemplate({ name: 'My Invoice' }), { record: {}, tenant: TENANT });
    expect(html).toContain('<title>My Invoice</title>');
  });
});
