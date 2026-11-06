/**
 * BOM (Bill of Materials) / Recipe engine types
 */

export interface BOMHeader {
  id: string;
  appId: string;
  productId: string;      // finished product
  productName: string;
  unit: string;           // per unit of what? (kg, pcs, litre)
  version: string;        // R0, R1, R2
  isActive: boolean;
  components: BOMLine[];
  byProducts?: BOMLine[];
  notes?: string;
}

export interface BOMLine {
  id: string;
  bomId: string;
  componentId: string;    // raw material / sub-assembly
  componentName: string;
  qtyPerUnit: number;     // qty of component per 1 unit of product
  unit: string;
  wastePercent: number;   // 0-100, adds to effective qty
  isOptional: boolean;
  substituteIds?: string[];
}

export interface WorkOrder {
  id: string;
  bomId: string;
  productId: string;
  targetQty: number;
  unit: string;
  status: 'Draft' | 'Released' | 'In Progress' | 'Completed' | 'Cancelled';
  plannedStart?: Date;
  plannedEnd?: Date;
  consumptionLines: WorkOrderConsumption[];
}

export interface WorkOrderConsumption {
  componentId: string;
  requiredQty: number;    // scaled from BOM * targetQty
  issuedQty: number;      // actual issued from stock
  returnedQty: number;
  unit: string;
  status: 'Pending' | 'Issued' | 'Partial' | 'Returned';
}

export interface ScaledComponent {
  componentId: string;
  componentName: string;
  requiredQty: number;    // qtyPerUnit * targetQty * (1 + wastePercent/100)
  unit: string;
  isOptional: boolean;
}

export interface MaterialAvailability {
  componentId: string;
  componentName: string;
  requiredQty: number;
  availableQty: number;
  shortage: number;        // 0 if no shortage
  hasSubstitute: boolean;
}

export interface BOMCost {
  materialCost: number;
  byProductCredit: number;
  netCost: number;
  costPerUnit: number;
}

// DB row shapes returned from platform schema
export interface BOMHeaderRow {
  id: string;
  app_id: string;
  product_id: string;
  product_name: string;
  unit: string;
  version: string;
  is_active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface BOMLineRow {
  id: string;
  bom_id: string;
  component_id: string;
  component_name: string;
  qty_per_unit: string;        // numeric comes as string from pg
  unit: string;
  waste_percent: string;       // numeric comes as string from pg
  is_optional: boolean;
  is_by_product: boolean;
  substitute_ids: string[];
  display_order: number;
}

export interface WorkOrderRow {
  id: string;
  app_id: string;
  bom_id: string;
  product_id: string;
  target_qty: string;
  unit: string;
  status: string;
  planned_start: string | null;
  planned_end: string | null;
  created_at: string;
  updated_at: string;
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
