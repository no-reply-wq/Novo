/**
 * Stock engine public types — Wave 10.
 *
 * These types form the external contract used by API routes and UI components.
 * The implementation delegates to the core engines in src/platform/engines/stock/.
 */

export interface StockConfig {
  /** Which table is a stock movement table */
  tableId: string;
  /** Field that holds the item/product */
  itemField: string;
  /** Field that holds warehouse/location */
  locationField: string;
  /** Field that holds quantity */
  qtyField: string;
  /**
   * Direction of this movement.
   * 'expression' allows an expression like `type == "Receipt" ? "in" : "out"`.
   */
  direction: 'in' | 'out' | 'expression';
  /** Expression evaluated when direction === 'expression' */
  directionExpr?: string;
  /** Only post stock when status field equals this value */
  triggerStatus?: string;
  /** Optional: field holding batch/lot number */
  batchField?: string;
  /** Optional: for FEFO draw-down */
  expiryField?: string;
  /** Optional: for valuation */
  costField?: string;
  /** Draw-down method (default FIFO) */
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
  /** Qty reserved by open sales orders / indents (not yet implemented — always 0) */
  reservedQty: number;
  /** Qty on pending purchase orders (not yet implemented — always 0) */
  onOrderQty: number;
}

export interface FifoAllocation {
  batchNo: string;
  qty: number;
  costPerUnit: number;
}
