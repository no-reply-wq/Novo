import {
  aggregateGSTR1,
  formatGSTDate,
  getSupplyType,
  isValidGSTIN,
} from '../aggregator';
import type { GSTR1Config } from '../types';

// ─── Shared test config ───────────────────────────────────────────────────────

const config: GSTR1Config = {
  gstin: '27AAPFU0939F1ZV',
  legalName: 'Test Company Pvt Ltd',
  invoiceTableId: 'invoices',
  fieldMapping: {
    invoiceNumber: 'invoice_no',
    invoiceDate: 'invoice_date',
    invoiceType: 'invoice_type',
    buyerGstin: 'buyer_gstin',
    buyerName: 'buyer_name',
    buyerStateCode: 'buyer_state',
    placeOfSupply: 'buyer_state',
    reverseCharge: 'reverse_charge',
    invoiceValue: 'invoice_value',
    taxableValue: 'taxable_value',
    igstAmount: 'igst',
    cgstAmount: 'cgst',
    sgstAmount: 'sgst',
    cessAmount: 'cess',
    hsnCode: 'hsn',
    itemDescription: 'description',
  },
};

const testInvoices: Record<string, unknown>[] = [
  {
    invoice_no: 'INV-001',
    invoice_date: '2024-01-05',
    invoice_type: 'B2B',
    buyer_gstin: '27AAPFU0939F1ZV',
    buyer_name: 'ABC Corp',
    buyer_state: '27',
    reverse_charge: 'N',
    invoice_value: 11800,
    taxable_value: 10000,
    igst: 0,
    cgst: 900,
    sgst: 900,
    cess: 0,
    hsn: '8471',
    description: 'Laptop',
  },
  {
    invoice_no: 'INV-002',
    invoice_date: '2024-01-10',
    invoice_type: 'B2C',
    buyer_gstin: '',
    buyer_name: 'Mr. Consumer',
    buyer_state: '29',
    reverse_charge: 'N',
    invoice_value: 354000,
    taxable_value: 300000,
    igst: 54000,
    cgst: 0,
    sgst: 0,
    cess: 0,
    hsn: '8471',
    description: 'Server',
  },
  {
    invoice_no: 'INV-003',
    invoice_date: '2024-01-15',
    invoice_type: 'B2C',
    buyer_gstin: '',
    buyer_name: 'Ms. Local',
    buyer_state: '27',
    reverse_charge: 'N',
    invoice_value: 5900,
    taxable_value: 5000,
    igst: 0,
    cgst: 450,
    sgst: 450,
    cess: 0,
    hsn: '8471',
    description: 'USB Hub',
  },
  {
    // Should be excluded — different month
    invoice_no: 'INV-004',
    invoice_date: '2024-02-01',
    invoice_type: 'B2B',
    buyer_gstin: '29AAPFU0939F1ZV',
    buyer_name: 'XYZ Ltd',
    buyer_state: '29',
    reverse_charge: 'N',
    invoice_value: 11800,
    taxable_value: 10000,
    igst: 1800,
    cgst: 0,
    sgst: 0,
    cess: 0,
    hsn: '8471',
    description: 'Monitor',
  },
];

const period = { month: 1, year: 2024 };
const sellerStateCode = '27';

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('isValidGSTIN', () => {
  it('returns true for a valid GSTIN', () => {
    expect(isValidGSTIN('27AAPFU0939F1ZV')).toBe(true);
  });

  it('returns false for an invalid GSTIN', () => {
    expect(isValidGSTIN('INVALID')).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(isValidGSTIN('')).toBe(false);
  });

  it('returns false for 14-char string', () => {
    expect(isValidGSTIN('27AAPFU0939F1Z')).toBe(false);
  });

  it('returns false for GSTIN with wrong checksum pattern', () => {
    expect(isValidGSTIN('27AAPFU0939F1AB')).toBe(false);
  });
});

describe('formatGSTDate', () => {
  it('converts ISO date to DD-MM-YYYY', () => {
    expect(formatGSTDate('2024-01-15')).toBe('15-01-2024');
  });

  it('converts slash-separated DD/MM/YYYY', () => {
    expect(formatGSTDate('15/01/2024')).toBe('15-01-2024');
  });

  it('passes through already-formatted DD-MM-YYYY', () => {
    expect(formatGSTDate('15-01-2024')).toBe('15-01-2024');
  });
});

describe('getSupplyType', () => {
  it('returns INTER for different states', () => {
    expect(getSupplyType('27', '29')).toBe('INTER');
  });

  it('returns INTRA for same state', () => {
    expect(getSupplyType('27', '27')).toBe('INTRA');
  });
});

describe('aggregateGSTR1 — B2B', () => {
  const result = aggregateGSTR1({ invoices: testInvoices, config, period, sellerStateCode });

  it('places B2B invoice in b2b section', () => {
    const b2bEntry = result.b2b.find((e) => e.ctin === '27AAPFU0939F1ZV');
    expect(b2bEntry).toBeDefined();
    expect(b2bEntry?.inv.length).toBe(1);
    expect(b2bEntry?.inv[0].inum).toBe('INV-001');
  });

  it('sets correct invoice date format', () => {
    const b2bEntry = result.b2b.find((e) => e.ctin === '27AAPFU0939F1ZV');
    expect(b2bEntry?.inv[0].idt).toBe('05-01-2024');
  });

  it('does NOT place B2C invoices in b2b', () => {
    const allInvoiceNums = result.b2b.flatMap((e) => e.inv.map((i) => i.inum));
    expect(allInvoiceNums).not.toContain('INV-002');
    expect(allInvoiceNums).not.toContain('INV-003');
  });
});

describe('aggregateGSTR1 — B2CL', () => {
  const result = aggregateGSTR1({ invoices: testInvoices, config, period, sellerStateCode });

  it('places inter-state B2C >2.5L invoice in b2cl', () => {
    expect(result.b2cl.length).toBeGreaterThan(0);
    const allB2CLInvoices = result.b2cl.flatMap((e) => e.inv.map((i) => i.inum));
    expect(allB2CLInvoices).toContain('INV-002');
  });

  it('groups B2CL by place of supply', () => {
    const posGroup = result.b2cl.find((e) => e.pos === '29');
    expect(posGroup).toBeDefined();
    expect(posGroup?.inv[0].val).toBe(354000);
  });
});

describe('aggregateGSTR1 — B2CS', () => {
  const result = aggregateGSTR1({ invoices: testInvoices, config, period, sellerStateCode });

  it('places intra-state B2C invoice in b2cs', () => {
    expect(result.b2cs.length).toBeGreaterThan(0);
    // INV-003: intra-state (27→27), value 5900 < 2.5L
    const intraGroup = result.b2cs.find((s) => s.sply_ty === 'INTRA' && s.pos === '27');
    expect(intraGroup).toBeDefined();
    expect(intraGroup?.txval).toBe(5000);
  });

  it('does NOT place B2CL invoices in b2cs', () => {
    // INV-002 is 3,54,000 inter-state → goes to b2cl not b2cs
    const interLargeGroup = result.b2cs.find((s) => s.sply_ty === 'INTER' && s.txval >= 300000);
    expect(interLargeGroup).toBeUndefined();
  });
});

describe('aggregateGSTR1 — HSN Summary', () => {
  const result = aggregateGSTR1({ invoices: testInvoices, config, period, sellerStateCode });

  it('aggregates HSN quantities and amounts', () => {
    const hsnEntry = result.hsn.find((h) => h.hsn_sc === '8471');
    expect(hsnEntry).toBeDefined();
    // 3 invoices in Jan 2024 all have HSN 8471 (INV-004 is Feb, excluded)
    expect(hsnEntry?.qty).toBe(3);
    expect(hsnEntry?.txval).toBe(315000); // 10000 + 300000 + 5000
  });

  it('accumulates tax amounts in HSN', () => {
    const hsnEntry = result.hsn.find((h) => h.hsn_sc === '8471');
    expect(hsnEntry?.iamt).toBe(54000);     // INV-002 igst
    expect(hsnEntry?.camt).toBe(900 + 450); // INV-001 + INV-003 cgst
    expect(hsnEntry?.samt).toBe(900 + 450); // INV-001 + INV-003 sgst
  });
});

describe('aggregateGSTR1 — Period Filter', () => {
  it('only includes invoices from the specified period', () => {
    const result = aggregateGSTR1({ invoices: testInvoices, config, period, sellerStateCode });
    // INV-004 is in Feb 2024 — should not appear anywhere
    const allB2BInvoices = result.b2b.flatMap((e) => e.inv.map((i) => i.inum));
    const allB2CLInvoices = result.b2cl.flatMap((e) => e.inv.map((i) => i.inum));
    expect(allB2BInvoices).not.toContain('INV-004');
    expect(allB2CLInvoices).not.toContain('INV-004');
  });

  it('returns empty sections when no invoices match the period', () => {
    const result = aggregateGSTR1({ invoices: testInvoices, config, period: { month: 6, year: 2024 }, sellerStateCode });
    expect(result.b2b).toHaveLength(0);
    expect(result.b2cl).toHaveLength(0);
    expect(result.b2cs).toHaveLength(0);
  });
});

describe('aggregateGSTR1 — Filing Period', () => {
  it('formats fp as MMYYYY', () => {
    const result = aggregateGSTR1({ invoices: testInvoices, config, period: { month: 1, year: 2024 }, sellerStateCode });
    expect(result.fp).toBe('012024');
  });

  it('pads single-digit month', () => {
    const result = aggregateGSTR1({ invoices: testInvoices, config, period: { month: 3, year: 2024 }, sellerStateCode });
    expect(result.fp).toBe('032024');
  });
});

describe('aggregateGSTR1 — CDNR', () => {
  const creditNoteInvoices: Record<string, unknown>[] = [
    {
      invoice_no: 'CN-001',
      invoice_date: '2024-01-20',
      invoice_type: 'Credit Note',
      buyer_gstin: '27AAPFU0939F1ZV',
      buyer_name: 'ABC Corp',
      buyer_state: '27',
      reverse_charge: 'N',
      invoice_value: -5900,
      taxable_value: -5000,
      igst: 0,
      cgst: -450,
      sgst: -450,
      cess: 0,
      hsn: '8471',
      description: 'Return',
    },
  ];

  it('places credit notes to registered buyers in cdnr', () => {
    const result = aggregateGSTR1({ invoices: creditNoteInvoices, config, period, sellerStateCode });
    expect(result.cdnr.length).toBe(1);
    expect(result.cdnr[0].ctin).toBe('27AAPFU0939F1ZV');
    expect(result.cdnr[0].nt[0].ntty).toBe('C');
    expect(result.cdnr[0].nt[0].nt_num).toBe('CN-001');
  });
});
