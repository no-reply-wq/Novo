import { generateTallyXml, recordToVoucher } from '../exporter';
import type { TallyVoucher, TallyExportConfig, TallyVoucherMapping } from '../types';

const defaultConfig: TallyExportConfig = {
  companyName: 'Test Co',
  financialYear: '2024-25',
  exportFormat: 'xml',
};

describe('generateTallyXml', () => {
  it('generates valid XML with correct structure for a single voucher', () => {
    const vouchers: TallyVoucher[] = [
      {
        date: '2024-01-15',
        voucherType: 'Sales',
        voucherNumber: 'INV-2024-0001',
        partyName: 'Customer Name',
        amount: 10000,
        narration: 'Invoice for goods',
        ledgerEntries: [
          { ledgerName: 'Sales Account', amount: 10000 },
          { ledgerName: 'Customer A/c', amount: 10000 },
        ],
      },
    ];

    const xml = generateTallyXml({ vouchers, config: defaultConfig });

    // Structure checks
    expect(xml).toContain('<ENVELOPE>');
    expect(xml).toContain('<TALLYREQUEST>Import Data</TALLYREQUEST>');
    expect(xml).toContain('<REPORTNAME>Vouchers</REPORTNAME>');
    expect(xml).toContain('<TALLYMESSAGE xmlns:UDF="TallyUDF">');
    expect(xml).toContain('VCHTYPE="Sales"');
    expect(xml).toContain('ACTION="Create"');
    expect(xml).toContain('<DATE>20240115</DATE>');
    expect(xml).toContain('<VOUCHERNUMBER>INV-2024-0001</VOUCHERNUMBER>');
    expect(xml).toContain('<PARTYLEDGERNAME>Customer Name</PARTYLEDGERNAME>');
    expect(xml).toContain('<NARRATION>Invoice for goods</NARRATION>');
    expect(xml).toContain('<LEDGERNAME>Sales Account</LEDGERNAME>');
    expect(xml).toContain('</ENVELOPE>');
  });

  it('generates valid empty XML with 0 vouchers', () => {
    const xml = generateTallyXml({ vouchers: [], config: defaultConfig });

    expect(xml).toContain('<ENVELOPE>');
    expect(xml).toContain('<TALLYMESSAGE xmlns:UDF="TallyUDF">');
    expect(xml).toContain('</TALLYMESSAGE>');
    expect(xml).not.toContain('<VOUCHER');
  });

  it('formats dates correctly from ISO to Tally format', () => {
    const vouchers: TallyVoucher[] = [
      {
        date: '2024-01-15',
        voucherType: 'Receipt',
        voucherNumber: 'REC-001',
        partyName: 'Vendor',
        amount: 5000,
        ledgerEntries: [{ ledgerName: 'Cash', amount: 5000 }],
      },
    ];

    const xml = generateTallyXml({ vouchers, config: defaultConfig });
    expect(xml).toContain('<DATE>20240115</DATE>');
    expect(xml).not.toContain('2024-01-15');
  });

  it('applies negative amount for Sales voucher (Cr side)', () => {
    const vouchers: TallyVoucher[] = [
      {
        date: '2024-02-01',
        voucherType: 'Sales',
        voucherNumber: 'INV-001',
        partyName: 'Buyer',
        amount: 10000,
        ledgerEntries: [{ ledgerName: 'Sales A/c', amount: 10000 }],
      },
    ];

    const xml = generateTallyXml({ vouchers, config: defaultConfig });
    expect(xml).toContain('<AMOUNT>-10000</AMOUNT>');
  });

  it('applies positive amount for Purchase voucher (Dr side)', () => {
    const vouchers: TallyVoucher[] = [
      {
        date: '2024-02-01',
        voucherType: 'Purchase',
        voucherNumber: 'PO-001',
        partyName: 'Supplier',
        amount: 8000,
        ledgerEntries: [{ ledgerName: 'Purchase A/c', amount: 8000 }],
      },
    ];

    const xml = generateTallyXml({ vouchers, config: defaultConfig });
    expect(xml).toContain('<AMOUNT>8000</AMOUNT>');
  });

  it('escapes XML special characters in party name and narration', () => {
    const vouchers: TallyVoucher[] = [
      {
        date: '2024-03-01',
        voucherType: 'Journal',
        voucherNumber: 'JNL-001',
        partyName: 'A & B <Pvt> Ltd',
        amount: 1000,
        narration: 'Note: "Transfer" to <fund>',
        ledgerEntries: [{ ledgerName: 'General Ledger', amount: 1000 }],
      },
    ];

    const xml = generateTallyXml({ vouchers, config: defaultConfig });
    expect(xml).toContain('A &amp; B &lt;Pvt&gt; Ltd');
    expect(xml).toContain('Note: &quot;Transfer&quot; to &lt;fund&gt;');
  });
});

describe('recordToVoucher', () => {
  it('maps record fields to TallyVoucher correctly', () => {
    const record: Record<string, unknown> = {
      invoice_date: '2024-03-10',
      invoice_number: 'INV-500',
      customer_name: 'XYZ Corp',
      total_amount: 25000,
    };

    const mapping: TallyVoucherMapping = {
      dateField: 'invoice_date',
      voucherNumberField: 'invoice_number',
      partyField: 'customer_name',
      amountField: 'total_amount',
      voucherType: 'Sales',
      ledgerMappings: [
        { ledgerName: 'Sales Account', amountExpression: 'record.total_amount' },
      ],
    };

    const voucher = recordToVoucher(record, mapping);

    expect(voucher.date).toBe('2024-03-10');
    expect(voucher.voucherNumber).toBe('INV-500');
    expect(voucher.partyName).toBe('XYZ Corp');
    expect(voucher.amount).toBe(25000);
    expect(voucher.voucherType).toBe('Sales');
    expect(voucher.ledgerEntries[0]?.ledgerName).toBe('Sales Account');
    expect(voucher.ledgerEntries[0]?.amount).toBe(25000);
  });

  it('resolves record.fieldName expressions for ledger amounts', () => {
    const record: Record<string, unknown> = {
      date: '2024-04-01',
      num: 'PO-100',
      party: 'Supplier',
      base_amount: 9000,
      tax_amount: 1620,
    };

    const mapping: TallyVoucherMapping = {
      dateField: 'date',
      voucherNumberField: 'num',
      partyField: 'party',
      amountField: 'base_amount',
      voucherType: 'Purchase',
      ledgerMappings: [
        { ledgerName: 'Purchase A/c', amountExpression: 'record.base_amount' },
        { ledgerName: 'GST Input', amountExpression: 'record.tax_amount' },
      ],
    };

    const voucher = recordToVoucher(record, mapping);
    expect(voucher.ledgerEntries[0]?.amount).toBe(9000);
    expect(voucher.ledgerEntries[1]?.amount).toBe(1620);
  });
});
