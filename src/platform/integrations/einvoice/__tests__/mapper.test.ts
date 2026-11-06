import { mapRecordToPayload } from '../mapper';
import type { EInvoiceFieldMapping } from '../types';

const mapping: EInvoiceFieldMapping = {
  invoiceNumber: 'inv_no',
  invoiceDate: 'inv_date',
  buyerGstin: 'buyer_gstin',
  buyerName: 'buyer_name',
  buyerAddress: 'buyer_addr',
  buyerCity: 'buyer_city',
  buyerPincode: 'buyer_pin',
  buyerStateCode: 'buyer_state',
  itemsTableId: 'line-items-table-uuid',
  itemDescription: 'desc',
  itemHsn: 'hsn',
  itemQty: 'qty',
  itemUnit: 'unit',
  itemRate: 'rate',
  itemTaxableAmount: 'taxable',
  itemGstRate: 'gst_rate',
  totalTaxableAmount: 'total_taxable',
  totalGst: 'total_gst',
  totalInvoiceAmount: 'total_inv',
};

const baseParams = {
  sellerGstin: '27AAAAA0000A1Z5',
  sellerName: 'Test Seller Pvt Ltd',
  sellerAddress: '123 Main St',
  sellerCity: 'Mumbai',
  sellerPincode: '400001',
  sellerStateCode: '27',
};

describe('mapRecordToPayload', () => {
  it('produces valid IRP payload structure with complete record', () => {
    const record: Record<string, unknown> = {
      inv_no: 'INV-001',
      inv_date: '2024-01-15',
      buyer_gstin: '29BBBBB0000B1Z6',
      buyer_name: 'Buyer Co Ltd',
      buyer_addr: '456 Buyer St',
      buyer_city: 'Bangalore',
      buyer_pin: '560001',
      buyer_state: '29',
      total_taxable: 10000,
      total_gst: 1800,
      total_inv: 11800,
    };

    const lineItems: Record<string, unknown>[] = [
      { desc: 'Widget A', hsn: '8471', qty: 10, unit: 'NOS', rate: 1000, taxable: 10000, gst_rate: 18 },
    ];

    const payload = mapRecordToPayload({ invoiceRecord: record, lineItems, mapping, ...baseParams });

    expect(payload.version).toBe('1.1');
    expect(payload.tranDtls.taxSch).toBe('GST');
    expect(payload.docDtls.no).toBe('INV-001');
    expect(payload.sellerDtls.gstin).toBe('27AAAAA0000A1Z5');
    expect(payload.buyerDtls.gstin).toBe('29BBBBB0000B1Z6');
    expect(payload.itemList).toHaveLength(1);
    expect(payload.valDtls.assVal).toBe(10000);
    expect(payload.valDtls.totInvVal).toBe(11800);
  });

  it('formats dates from ISO YYYY-MM-DD to DD/MM/YYYY', () => {
    const record: Record<string, unknown> = {
      inv_no: 'INV-002',
      inv_date: '2024-01-15',
      buyer_gstin: '27CCCCC0000C1Z7',
      buyer_name: 'Buyer',
      buyer_addr: 'Addr',
      buyer_city: 'City',
      buyer_pin: '400001',
      buyer_state: '27',
    };

    const payload = mapRecordToPayload({ invoiceRecord: record, lineItems: [], mapping, ...baseParams });
    expect(payload.docDtls.dt).toBe('15/01/2024');
  });

  it('computes CGST/SGST for intra-state (same seller/buyer state)', () => {
    const record: Record<string, unknown> = {
      inv_no: 'INV-003',
      inv_date: '2024-03-01',
      buyer_gstin: '27DDDDD0000D1Z8',
      buyer_name: 'Buyer',
      buyer_addr: 'Addr',
      buyer_city: 'Mumbai',
      buyer_pin: '400001',
      buyer_state: '27', // Same as seller state code 27
    };

    const lineItems: Record<string, unknown>[] = [
      { desc: 'Product', hsn: '1234', qty: 1, unit: 'NOS', rate: 10000, taxable: 10000, gst_rate: 18 },
    ];

    const payload = mapRecordToPayload({ invoiceRecord: record, lineItems, mapping, ...baseParams });

    const item = payload.itemList[0];
    expect(item.cgstAmt).toBeCloseTo(900, 1); // 9% of 10000
    expect(item.sgstAmt).toBeCloseTo(900, 1); // 9% of 10000
    expect(item.igstAmt).toBeUndefined();
    expect(payload.valDtls.cgstVal).toBeCloseTo(900, 1);
    expect(payload.valDtls.sgstVal).toBeCloseTo(900, 1);
    expect(payload.valDtls.igstVal).toBe(0);
  });

  it('computes IGST for inter-state (different seller/buyer state)', () => {
    const record: Record<string, unknown> = {
      inv_no: 'INV-004',
      inv_date: '2024-03-01',
      buyer_gstin: '29EEEEE0000E1Z9',
      buyer_name: 'Buyer',
      buyer_addr: 'Addr',
      buyer_city: 'Bangalore',
      buyer_pin: '560001',
      buyer_state: '29', // Different from seller state code 27
    };

    const lineItems: Record<string, unknown>[] = [
      { desc: 'Product', hsn: '1234', qty: 1, unit: 'NOS', rate: 10000, taxable: 10000, gst_rate: 18 },
    ];

    const payload = mapRecordToPayload({ invoiceRecord: record, lineItems, mapping, ...baseParams });

    const item = payload.itemList[0];
    expect(item.igstAmt).toBeCloseTo(1800, 1); // 18% of 10000
    expect(item.cgstAmt).toBeUndefined();
    expect(item.sgstAmt).toBeUndefined();
    expect(payload.valDtls.igstVal).toBeCloseTo(1800, 1);
    expect(payload.valDtls.cgstVal).toBe(0);
    expect(payload.valDtls.sgstVal).toBe(0);
  });

  it('assigns sequential slNo to items', () => {
    const record: Record<string, unknown> = {
      inv_no: 'INV-005',
      inv_date: '2024-03-01',
      buyer_gstin: '27FFFFF0000F1Z0',
      buyer_name: 'Buyer',
      buyer_addr: 'Addr',
      buyer_city: 'Mumbai',
      buyer_pin: '400001',
      buyer_state: '27',
    };

    const lineItems: Record<string, unknown>[] = [
      { desc: 'Item 1', hsn: '1001', qty: 1, unit: 'NOS', rate: 100, taxable: 100, gst_rate: 5 },
      { desc: 'Item 2', hsn: '1002', qty: 2, unit: 'NOS', rate: 200, taxable: 400, gst_rate: 12 },
    ];

    const payload = mapRecordToPayload({ invoiceRecord: record, lineItems, mapping, ...baseParams });

    expect(payload.itemList[0].slNo).toBe('1');
    expect(payload.itemList[1].slNo).toBe('2');
  });

  it('keeps already-formatted DD/MM/YYYY date as-is', () => {
    const record: Record<string, unknown> = {
      inv_no: 'INV-006',
      inv_date: '31/12/2024',
      buyer_gstin: '27GGGGG0000G1Z1',
      buyer_name: 'Buyer',
      buyer_addr: 'Addr',
      buyer_city: 'Mumbai',
      buyer_pin: '400001',
      buyer_state: '27',
    };

    const payload = mapRecordToPayload({ invoiceRecord: record, lineItems: [], mapping, ...baseParams });
    expect(payload.docDtls.dt).toBe('31/12/2024');
  });
});
