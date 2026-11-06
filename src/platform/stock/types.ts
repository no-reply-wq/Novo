/**
 * Wave 10 — Stock & Fulfilment engine public types.
 */

// ─── Stock types ──────────────────────────────────────────────────────────────

export interface StockConfig {
  /** ID of the table that triggers stock movements */
  tableId: string;
  /** Field name on the record that holds the item/SKU id */
  itemField: string;
  /** Field name on the record that holds the warehouse/location id */
  locationField: string;
  /** Field name on the record that holds the movement quantity */
  qtyField: string;
  /** Whether the movement is an inbound, outbound, or expression-driven direction */
  direction: 'in' | 'out' | 'expression';
  /** Expression evaluated to determine direction when direction === 'expression' */
  directionExpr?: string;
  /** Only post the movement when the record's status field equals this value */
  triggerStatus?: string;
  /** Field name holding batch / lot number */
  batchField?: string;
  /** Field name holding batch expiry date */
  expiryField?: string;
  /** Field name holding unit cost */
  costField?: string;
  /** Draw-down method for OUT movements — FIFO (default) or FEFO */
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
