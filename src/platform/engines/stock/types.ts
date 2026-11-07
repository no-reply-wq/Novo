/**
 * Stock engine config types — Wave 2 Agent H.
 * These types describe how a table triggers stock movements.
 */

export interface StockMovementConfig {
  id: string;
  appId: string;
  tableApiKey: string;        // the table that triggers stock movements
  itemFieldApiKey: string;    // field holding item/product id
  locationFieldApiKey: string;// field holding location/warehouse id
  qtyFieldApiKey: string;     // field holding quantity
  direction: 'in' | 'out' | 'expr'; // 'expr' = evaluate directionExpr
  directionExpr?: string;     // e.g. "type == 'Receipt' ? 'in' : 'out'"
  triggerStatusFieldApiKey?: string; // only post stock when this field changes to...
  triggerStatusValue?: string;       // ...this value
  batchFieldApiKey?: string;  // optional batch tracking
  lotFieldApiKey?: string;    // optional lot tracking
  expiryFieldApiKey?: string; // optional expiry date field
  drawMethod?: 'fifo' | 'fefo'; // for outbound: how to pick batches
}

export interface StockLedgerRow {
  id: string;
  appId: string;
  tenantSlug: string;
  tableApiKey: string;
  recordId: string;
  itemId: string;
  locationId: string;
  qty: number;
  direction: 'in' | 'out';
  batchNo?: string;
  lotNo?: string;
  expiryDate?: Date;
  postedAt: Date;
  postedBy?: string;
  reversedAt?: Date;
  reversedBy?: string;
}

export interface BatchBalance {
  batchNo: string;
  lotNo: string;
  expiryDate: Date | null;
  qty: number;
}
