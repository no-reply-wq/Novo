import { mapRecordToEWBPayload, formatDateToDDMMYYYY } from '../mapper';
import type { EWayBillConfig, EWayBillFieldMapping } from '../types';

const CONFIG: EWayBillConfig = {
  gstin: '27AAPFU0939F1ZV',
  username: 'testuser',
  password: 'testpass',
  sandbox: true,
};

const MAPPING: EWayBillFieldMapping = {
  documentNumber: 'doc_no',
  documentDate: 'doc_date',
  fromGstin: 'from_gstin',
  fromName: 'from_name',
  fromAddress: 'from_addr',
  fromCity: 'from_city',
  fromPincode: 'from_pin',
  fromStateCode: 'from_state',
  toGstin: 'to_gstin',
  toName: 'to_name',
  toAddress: 'to_addr',
  toCity: 'to_city',
  toPincode: 'to_pin',
  toStateCode: 'to_state',
  transportMode: 'trans_mode',
  vehicleNumber: 'vehicle_no',
  distance: 'distance',
  itemsTableId: 'items_table',
  itemName: 'item_name',
  itemHsn: 'hsn_code',
  itemQty: 'quantity',
  itemUnit: 'unit',
  itemTaxableAmount: 'taxable_amt',
  itemGstRate: 'gst_rate',
};

const RECORD: Record<string, unknown> = {
  doc_no: 'INV-001',
  doc_date: '2024-01-15',
  from_gstin: '27AAPFU0939F1ZV',
  from_name: 'Acme Corp',
  from_addr: '123 MG Road',
  from_city: 'Mumbai',
  from_pin: 400001,
  from_state: 27,
  to_gstin: '33AAPFU0939F1ZV',
  to_name: 'Beta Ltd',
  to_addr: '456 Anna Salai',
  to_city: 'Chennai',
  to_pin: 600001,
  to_state: 33,
  trans_mode: '1',
  vehicle_no: 'MH12AB1234',
  distance: '1500',
};

const LINE_ITEMS: Record<string, unknown>[] = [
  {
    item_name: 'Steel Rods',
    hsn_code: '7213',
    quantity: 10,
    unit: 'NOS',
    taxable_amt: 50000,
    gst_rate: 18,
  },
  {
    item_name: 'Steel Plates',
    hsn_code: '7208',
    quantity: 5,
    unit: 'NOS',
    taxable_amt: 25000,
    gst_rate: 18,
  },
];

describe('formatDateToDDMMYYYY', () => {
  it('converts ISO date to DD/MM/YYYY', () => {
    expect(formatDateToDDMMYYYY('2024-01-15')).toBe('15/01/2024');
  });

  it('leaves DD/MM/YYYY unchanged', () => {
    expect(formatDateToDDMMYYYY('15/01/2024')).toBe('15/01/2024');
  });

  it('returns empty string for empty input', () => {
    expect(formatDateToDDMMYYYY('')).toBe('');
  });

  it('handles end of year date', () => {
    expect(formatDateToDDMMYYYY('2024-12-31')).toBe('31/12/2024');
  });
});

describe('mapRecordToEWBPayload', () => {
  it('produces correct top-level structure', () => {
    const payload = mapRecordToEWBPayload({
      record: RECORD,
      lineItems: LINE_ITEMS,
      mapping: MAPPING,
      config: CONFIG,
    });

    expect(payload.docNo).toBe('INV-001');
    expect(payload.docDate).toBe('15/01/2024');
    expect(payload.fromGstin).toBe('27AAPFU0939F1ZV');
    expect(payload.fromTrdName).toBe('Acme Corp');
    expect(payload.fromPlace).toBe('Mumbai');
    expect(payload.fromPincode).toBe(400001);
    expect(payload.fromStateCode).toBe(27);
    expect(payload.toGstin).toBe('33AAPFU0939F1ZV');
    expect(payload.toPlace).toBe('Chennai');
    expect(payload.toPincode).toBe(600001);
    expect(payload.toStateCode).toBe(33);
    expect(payload.transMode).toBe('1');
    expect(payload.vehicleNo).toBe('MH12AB1234');
    expect(payload.transDistance).toBe('1500');
  });

  it('maps item list correctly', () => {
    const payload = mapRecordToEWBPayload({
      record: RECORD,
      lineItems: LINE_ITEMS,
      mapping: MAPPING,
      config: CONFIG,
    });

    expect(payload.itemList).toHaveLength(2);

    const item1 = payload.itemList[0];
    expect(item1).toBeDefined();
    expect(item1!.itemNo).toBe(1);
    expect(item1!.productName).toBe('Steel Rods');
    expect(item1!.hsnCode).toBe('7213');
    expect(item1!.quantity).toBe(10);
    expect(item1!.qtyUnit).toBe('NOS');
    expect(item1!.taxableAmount).toBe(50000);

    const item2 = payload.itemList[1];
    expect(item2).toBeDefined();
    expect(item2!.itemNo).toBe(2);
    expect(item2!.productName).toBe('Steel Plates');
  });

  it('uses IGST for inter-state supply (from state 27 to state 33)', () => {
    const payload = mapRecordToEWBPayload({
      record: RECORD,
      lineItems: LINE_ITEMS,
      mapping: MAPPING,
      config: CONFIG,
    });

    // from_state=27, to_state=33 — inter-state → IGST only
    const item = payload.itemList[0];
    expect(item).toBeDefined();
    expect(item!.igstRate).toBe(18);
    expect(item!.cgstRate).toBe(0);
    expect(item!.sgstRate).toBe(0);
  });

  it('uses CGST/SGST for intra-state supply', () => {
    const intraRecord = { ...RECORD, to_state: 27 }; // same state as from
    const payload = mapRecordToEWBPayload({
      record: intraRecord,
      lineItems: LINE_ITEMS,
      mapping: MAPPING,
      config: CONFIG,
    });

    const item = payload.itemList[0];
    expect(item).toBeDefined();
    expect(item!.igstRate).toBe(0);
    expect(item!.cgstRate).toBe(9);
    expect(item!.sgstRate).toBe(9);
  });

  it('falls back to config GSTIN when fromGstin field is empty', () => {
    const noGstinRecord = { ...RECORD, from_gstin: '' };
    const payload = mapRecordToEWBPayload({
      record: noGstinRecord,
      lineItems: LINE_ITEMS,
      mapping: MAPPING,
      config: CONFIG,
    });

    expect(payload.fromGstin).toBe(CONFIG.gstin);
  });

  it('resolves state code from name string', () => {
    const namedStateRecord = { ...RECORD, from_state: 'Maharashtra', to_state: 'Tamil Nadu' };
    const payload = mapRecordToEWBPayload({
      record: namedStateRecord,
      lineItems: LINE_ITEMS,
      mapping: MAPPING,
      config: CONFIG,
    });

    expect(payload.fromStateCode).toBe(27);
    expect(payload.toStateCode).toBe(33);
  });
});
