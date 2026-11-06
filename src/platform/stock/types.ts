/**
 * Stock engine public types — Wave 10.
 */

export interface StockConfig {
  tableId: string;
  itemField: string;
  locationField: string;
  qtyField: string;
  direction: 'in' | 'out' | 'expression';
  directionExpr?: string;
  triggerStatus?: string;
  batchField?: string;
  expiryField?: string;
  costField?: string;
  drawDownMethod?: 'FIFO' | 'FEFO';
}

export interface StockMovement {
  id: string;
  tenantSlug: string;
  itemId: string;
  locationId: string;
  batchNo?: string;
  expiryDate?: Date;
  direction: 'in' | 'out';
  qty: number;
  costPerUnit?: number;
  sourceTableId: string;
  sourceRecordId: string;
  postedAt: Date;
  reversedAt?: Date;
}

export interface StockBalance {
  itemId: string;
  locationId: string;
  batchNo?: string;
  availableQty: number;
  reservedQty: number;
  onOrderQty: number;
}

export interface FifoAllocation {
  batchNo: string;
  qty: number;
  costPerUnit: number;
}
