/**
 * Runtime domain types — used by the app runtime (end-user facing pages).
 */

import type { CSSProperties } from 'react';

// ─── Layout ───────────────────────────────────────────────────────────────────

export interface GridArea {
  rowStart: number;
  rowEnd: number;
  colStart: number;
  colEnd: number;
}

export interface GridLayout {
  columns: number; // 1-12
  rowHeight: number; // px
  gap: number; // px
}

// ─── Components ───────────────────────────────────────────────────────────────

export type ComponentType =
  | 'text'
  | 'heading'
  | 'image'
  | 'button'
  | 'container'
  | 'divider'
  | 'table'
  | 'list'
  | 'kanban'
  | 'calendar'
  | 'chart'
  | 'form'
  | 'input'
  | 'select'
  | 'datepicker'
  | 'statcard'
  | 'progress'
  | 'badge';

/** A prop value: either a plain value or a {{ expr }} binding string. */
export type ExpressionOrValue = string | number | boolean | null | ExpressionBinding;

export interface ExpressionBinding {
  __expr: string; // the raw expression inside {{ ... }}
}

export function isExpressionBinding(v: unknown): v is ExpressionBinding {
  return typeof v === 'object' && v !== null && '__expr' in v;
}

export interface EventBinding {
  event: string; // e.g. 'onClick', 'onRowClick', 'onSubmit'
  actions: Action[];
}

export interface ComponentInstance {
  id: string;
  type: ComponentType;
  props: Record<string, ExpressionOrValue>;
  events: EventBinding[];
  style: CSSProperties;
  gridArea: GridArea;
}

// ─── Queries ──────────────────────────────────────────────────────────────────

export type FilterOperator =
  | 'eq'
  | 'neq'
  | 'lt'
  | 'lte'
  | 'gt'
  | 'gte'
  | 'contains'
  | 'startsWith'
  | 'isNull'
  | 'isNotNull'
  | 'in';

export interface FilterCondition {
  field: string;
  operator: FilterOperator;
  value?: ExpressionOrValue;
}

export type FilterLogic = 'and' | 'or';

export interface FilterGroup {
  logic: FilterLogic;
  conditions: Array<FilterCondition | FilterGroup>;
}

export interface SortDef {
  field: string;
  direction: 'asc' | 'desc';
}

export interface QueryDefinition {
  id: string;
  name: string;
  type: 'table' | 'script' | 'connector';
  tableId?: string;
  filters?: FilterGroup;
  sort?: SortDef[];
  limit?: number;
}

// ─── Query results ────────────────────────────────────────────────────────────

export type Row = Record<string, unknown>;

export interface QueryResult {
  data: Row[];
  total: number;
  page: number;
  selectedRow: Row | null;
}

// ─── Pages ────────────────────────────────────────────────────────────────────

export interface AppPage {
  id: string;
  name: string;
  slug: string;
  layout: GridLayout;
  components: ComponentInstance[];
  queries: QueryDefinition[];
}

// ─── App config ───────────────────────────────────────────────────────────────

export interface AppNavItem {
  id: string;
  label: string;
  icon?: string;
  pageSlug: string;
  badgeQueryId?: string; // query whose result[0].count becomes badge
}

export interface AppConfig {
  id: string;
  name: string;
  slug: string;
  icon?: string;
  color?: string;
  navItems: AppNavItem[];
  pages: AppPage[];
}

// ─── Actions ──────────────────────────────────────────────────────────────────

export type Action =
  | { type: 'navigate'; page: string; params?: Record<string, string> }
  | { type: 'openModal'; modalId: string }
  | { type: 'submitForm'; formId: string }
  | { type: 'refreshQuery'; queryId: string }
  | { type: 'setPageState'; key: string; value: ExpressionOrValue }
  | { type: 'showToast'; message: string; variant: 'success' | 'error' | 'info' }
  | { type: 'runWorkflow'; workflowId: string; input: Record<string, unknown> };

// ─── Binding context ──────────────────────────────────────────────────────────

export interface BindingContext {
  queries: Record<string, QueryResult>;
  pageState: Record<string, unknown>;
  user: {
    id: string;
    name: string;
    role: string;
    locations: string[];
  };
  urlParams: Record<string, string>;
}
