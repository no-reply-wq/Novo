/**
 * Canvas types for the Novo visual page builder.
 * These extend / complement the platform contracts in src/platform/contracts/ui.ts.
 */

// ─── Re-export upstream types used by canvas ─────────────────────────────────
export type { ComponentDef, PageDef, QueryDef, ComponentType } from '@/platform/contracts/ui';

// ─── Prop / binding value ─────────────────────────────────────────────────────

export type PropValue = string | number | boolean | null | Record<string, unknown> | unknown[];

// ─── Layout ───────────────────────────────────────────────────────────────────

export interface CanvasLayout {
  type: 'grid' | 'flex';
  columns?: number; // 1-12 for grid
  gap?: number;
  breakpoints?: {
    desktop?: Partial<CanvasLayout>;
    tablet?: Partial<CanvasLayout>;
    mobile?: Partial<CanvasLayout>;
  };
}

// ─── Action chain ─────────────────────────────────────────────────────────────

export type ActionStepType =
  | 'navigate'
  | 'openModal'
  | 'closeModal'
  | 'setPageState'
  | 'submitForm'
  | 'refreshQuery'
  | 'runWorkflow'
  | 'showToast'
  | 'callApi'
  | 'runScript';

export interface ActionStep {
  id: string;
  type: ActionStepType;
  config: Record<string, unknown>;
}

export interface ActionChain {
  steps: ActionStep[];
}

// ─── Component instance (builder-side representation) ─────────────────────────

export interface ComponentInstance {
  id: string;
  type: string; // e.g. 'table', 'form', 'button', 'text', 'chart'
  layout: {
    col?: number;
    row?: number;
    colSpan?: number;
    rowSpan?: number;
    order?: number; // flex order
    breakpoints?: Record<string, Partial<ComponentInstance['layout']>>;
  };
  props: Record<string, PropValue>;
  bindings: Record<string, string>; // prop name → expression string
  events: Record<string, ActionChain>; // event name → action chain
  children?: ComponentInstance[]; // for containers / tabs
}

// ─── Page state variable ──────────────────────────────────────────────────────

export type PageStateVarType = 'string' | 'number' | 'boolean' | 'object' | 'array';

export interface PageStateVar {
  name: string;
  type: PageStateVarType;
  defaultValue?: PropValue;
}

// ─── Canvas page (builder working model) ─────────────────────────────────────

export interface CanvasPage {
  id: string;
  appId: string;
  name: string;
  slug: string;
  icon?: string;
  layout: CanvasLayout;
  components: ComponentInstance[];
  pageState: PageStateVar[];
  updatedAt?: string;
}

// ─── Palette entry ────────────────────────────────────────────────────────────

export type PaletteGroup =
  | 'Layout'
  | 'Display'
  | 'Data'
  | 'Input'
  | 'Capture'
  | 'Document';

export interface PaletteEntry {
  type: string;
  label: string;
  icon: string; // lucide icon name
  group: PaletteGroup;
  defaultProps: Record<string, PropValue>;
  defaultColSpan: number;
}

// ─── DnD item types ───────────────────────────────────────────────────────────

export const DND_TYPE_PALETTE = 'PALETTE_ITEM' as const;
export const DND_TYPE_CANVAS = 'CANVAS_COMPONENT' as const;

export interface PaletteDragItem {
  kind: typeof DND_TYPE_PALETTE;
  entry: PaletteEntry;
}

export interface CanvasDragItem {
  kind: typeof DND_TYPE_CANVAS;
  id: string;
  col: number;
  row: number;
  colSpan: number;
  rowSpan: number;
}

// ─── Drop result ──────────────────────────────────────────────────────────────

export interface DropResult {
  col: number;
  row: number;
}
