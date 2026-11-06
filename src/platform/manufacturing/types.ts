/**
 * BOM (Bill of Materials) / Recipe engine — shared types
 */

// ─── Core domain types ────────────────────────────────────────────────────────

export interface BOMLine {
  id: string;
  bomId: string;
  componentId: string;
  componentName: string;
  qtyPerUnit: number;
  unit: string;
  wastePercent: number;
  isOptional: boolean;
  substituteIds?: string[];
}

export interface BOMHeader {
  id: string;
  appId: string;
  productId: string;
  productName: string;
  unit: string;
  version: string;
  isActive: boolean;
  components: BOMLine[];
  byProducts?: BOMLine[];
  notes?: string;
}

export interface WorkOrderConsumption {
  componentId: string;
  requiredQty: number;
  issuedQty: number;
  returnedQty: number;
  unit: string;
  status: 'Pending' | 'Issued' | 'Partial' | 'Returned';
}

export interface WorkOrder {
  id: string;
  bomId: string;
  productId: string;
  targetQty: number;
  unit: string;
  status: 'Draft' | 'Released' | 'In Progress' | 'Completed' | 'Cancelled';
  plannedStart?: string;
  plannedEnd?: string;
  consumptionLines: WorkOrderConsumption[];
}

export interface ScaledComponent {
  componentId: string;
  componentName: string;
  requiredQty: number;
  unit: string;
  isOptional: boolean;
}

export interface MaterialAvailability {
  componentId: string;
  componentName: string;
  requiredQty: number;
  availableQty: number;
  shortage: number;
  hasSubstitute: boolean;
}

export interface BOMCost {
  materialCost: number;
  byProductCredit: number;
  netCost: number;
  costPerUnit: number;
}

// ─── Database row types (pg returns numerics as strings) ─────────────────────

export interface BOMHeaderRow {
  id: string;
  app_id: string;
  product_id: string;
  product_name: string;
  unit: string;
  version: string;
  is_active: boolean;
  notes: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface BOMLineRow {
  id: string;
  bom_id: string;
  component_id: string;
  component_name: string;
  qty_per_unit: string; // numeric from pg
  unit: string;
  waste_percent: string; // numeric from pg
  is_optional: boolean;
  is_by_product: boolean;
  substitute_ids: string[] | null;
  display_order: number;
}

export interface WorkOrderRow {
  id: string;
  app_id: string;
  bom_id: string;
  product_id: string;
  target_qty: string; // numeric from pg
  unit: string;
  status: string;
  planned_start: string | null;
  planned_end: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface WorkOrderConsumptionRow {
  id: string;
  work_order_id: string;
  component_id: string;
  required_qty: string;
  issued_qty: string;
  returned_qty: string;
  unit: string;
  status: string;
}
