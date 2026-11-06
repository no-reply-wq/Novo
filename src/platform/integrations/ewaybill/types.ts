/**
 * E-Way Bill integration types.
 * E-Way Bill is required for movement of goods above ₹50,000 within India.
 */

export interface EWayBillConfig {
  gstin: string;
  username: string;
  password: string; // encrypted
  sandbox: boolean;
}

export interface EWayBillPayload {
  supplyType: 'O' | 'I'; // Outward/Inward
  subSupplyType: '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | '11' | '12';
  docType: 'INV' | 'BIL' | 'BOE' | 'CHL' | 'CNT' | 'OTH';
  docNo: string;
  docDate: string; // DD/MM/YYYY
  fromGstin: string;
  fromTrdName: string;
  fromAddr1: string;
  fromPlace: string;
  fromPincode: number;
  fromStateCode: number;
  toGstin: string;
  toTrdName: string;
  toAddr1: string;
  toPlace: string;
  toPincode: number;
  toStateCode: number;
  transactionType: 1 | 2 | 3 | 4;
  transDistance: string;
  transporterName?: string;
  transporterId?: string;
  transMode: '1' | '2' | '3' | '4'; // Road/Rail/Air/Ship
  vehicleNo?: string;
  vehicleType?: 'R' | 'O'; // Regular/Over Dimensional
  itemList: EWayBillItem[];
}

export interface EWayBillItem {
  itemNo: number;
  productName: string;
  productDesc?: string;
  hsnCode: string;
  quantity: number;
  qtyUnit: string;
  cgstRate: number;
  sgstRate: number;
  igstRate: number;
  cessRate?: number;
  taxableAmount: number;
}

export interface EWayBillResponse {
  ewbNo: string; // 12-digit EWB number
  ewbDt: string; // generation datetime
  ewbValidTill: string; // validity datetime
  status: string;
}

export interface EWayBillFieldMapping {
  documentNumber: string;
  documentDate: string;
  fromGstin: string;
  fromName: string;
  fromAddress: string;
  fromCity: string;
  fromPincode: string;
  fromStateCode: string;
  toGstin: string;
  toName: string;
  toAddress: string;
  toCity: string;
  toPincode: string;
  toStateCode: string;
  transportMode: string;
  vehicleNumber: string;
  distance: string;
  itemsTableId: string;
  itemName: string;
  itemHsn: string;
  itemQty: string;
  itemUnit: string;
  itemTaxableAmount: string;
  itemGstRate: string;
}

export interface EWayBillCancelParams {
  ewbNo: string;
  cancelRsnCode: number; // 1=Duplicate, 2=Order Cancelled, 3=Data Entry Mistake, 4=Others
  cancelRmrk: string;
}

export interface EWayBillExtendParams {
  ewbNo: string;
  vehicleNo: string;
  fromPlace: string;
  fromState: number;
  remainingDistance: number;
  transMode: string;
  extnRsnCode: number;
  extnRemarks: string;
}

export interface EWayBillExtendResponse {
  validTill: string;
}
