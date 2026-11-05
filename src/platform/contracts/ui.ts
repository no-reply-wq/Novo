/**
 * UI / page builder contracts.
 *
 * RULE: Sub-agents may not change this file. Changes go through the Lead.
 */

// ─── ComponentDef ─────────────────────────────────────────────────────────────

export type ComponentType =
  // Basics
  | 'text' | 'heading' | 'image' | 'icon' | 'button' | 'link'
  | 'divider' | 'container' | 'tabs' | 'accordion' | 'modal' | 'drawer' | 'stepper'
  // Data display
  | 'table' | 'list' | 'cards' | 'kanban' | 'calendar' | 'timeline'
  | 'tree' | 'map' | 'chart_bar' | 'chart_line' | 'chart_pie' | 'chart_area'
  | 'kpi' | 'progress' | 'status_pill' | 'activity_timeline'
  // Input / form
  | 'form' | 'field_input' | 'line_item_grid' | 'search' | 'filter_bar'
  // Capture
  | 'barcode_scanner' | 'photo_capture' | 'signature_pad' | 'gps_capture'
  // Documents
  | 'pdf_viewer' | 'print_button' | 'label_print'
  // Escape hatch
  | 'custom_component';  // sandboxed iframe

/** A binding expression (e.g. "{{ table1.selectedRow.qty * 2 }}") or a literal. */
export type Binding = string;

export interface ComponentDef {
  id: string;
  pageId: string;
  parentId?: string;         // null = page root; set for nested components
  rank: number;
  componentType: ComponentType;

  // Layout (12-column grid)
  layout: {
    col: number;             // starting column (0–11)
    colSpan: number;         // width in columns (1–12)
    colSpanMd?: number;      // override at ≥ 768px
    colSpanSm?: number;      // override at ≥ 480px
    row?: number;
    rowSpan?: number;
  };

  // All properties are bindings (expression OR literal)
  props: Record<string, Binding | unknown>;

  // Event → action chain bindings
  events?: Record<string, string>;  // e.g. { onClick: "workflowId:wf-123" }

  // For 'custom_component' only
  customComponentId?: string;
  createdAt: Date;
  updatedAt: Date;
}

// ─── QueryDef ────────────────────────────────────────────────────────────────

export interface QueryDef {
  id: string;
  pageId: string;
  name: string;             // referenced in bindings as {{ name.data }}
  queryType: 'table' | 'script' | 'connector';

  // For 'table' queries
  tableId?: string;
  filterExpr?: string;
  sortFieldId?: string;
  sortDir?: 'asc' | 'desc';
  limit?: number;
  includeRelations?: string[]; // relation ids to JOIN

  // For 'script' queries
  scriptId?: string;
  scriptInput?: Record<string, Binding>;

  // For 'connector' queries
  connectorId?: string;
  requestName?: string;
  requestParams?: Record<string, Binding>;

  // Pagination
  pagination?: 'cursor' | 'offset' | 'none';
  createdAt: Date;
  updatedAt: Date;
}

// ─── PageDef ─────────────────────────────────────────────────────────────────

export interface PageDef {
  id: string;
  appId: string;
  name: string;
  slug: string;             // URL segment, e.g. "purchase-orders"
  icon?: string;
  description?: string;
  layout: 'free' | 'sidebar' | 'full';
  components: ComponentDef[];
  queries: QueryDef[];

  // Page-level state variables
  pageVariables?: Array<{
    name: string;
    type: 'text' | 'number' | 'boolean' | 'object' | 'array';
    defaultValue?: unknown;
  }>;

  // Access: which roles can see this page
  visibleToRoles?: string[];  // empty = all roles

  // Mobile
  mobileLayout?: 'default' | 'worker_mode'; // worker_mode = big-button template

  rank: number;             // menu order
  createdAt: Date;
  updatedAt: Date;
}

// ─── ThemeTokens ─────────────────────────────────────────────────────────────

export interface ThemeTokens {
  id: string;
  appId: string;
  name: string;

  // Colours
  colorPrimary: string;
  colorPrimaryFg: string;   // text on primary background
  colorSecondary: string;
  colorSuccess: string;
  colorWarning: string;
  colorDanger: string;
  colorBgBase: string;
  colorBgSurface: string;
  colorBgMuted: string;
  colorFgBase: string;
  colorFgMuted: string;
  colorBorder: string;

  // Dark-mode overrides (same keys)
  dark?: Partial<Omit<ThemeTokens, 'id' | 'appId' | 'name' | 'dark'>>;

  // Typography
  fontFamilyBase: string;
  fontFamilyMono: string;
  fontSizeBase: string;     // e.g. "14px"
  lineHeightBase: string;

  // Radius / density
  radiusSm: string;         // e.g. "4px"
  radiusMd: string;
  radiusLg: string;
  densityCompact: boolean;

  // Custom CSS (scoped to the app)
  customCss?: string;

  createdAt: Date;
  updatedAt: Date;
}
