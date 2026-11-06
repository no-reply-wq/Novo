// ─── Core entity ──────────────────────────────────────────────────────────────

export interface CustomComponent {
  id: string;
  appId: string;
  name: string;
  description?: string;
  sourceCode: string;       // HTML/JS/React source
  compiledCode?: string;    // bundled output (future: esbuild)
  propsSchema: ComponentPropDef[];
  eventsSchema: ComponentEventDef[];
  version: number;
  storageKey?: string;      // S3/R2 key for the compiled bundle
}

// Legacy shape used by older builder routes — kept for backward compat
export interface CustomComponentDefinition {
  id: string;
  tenantSlug: string;
  name: string;
  slug: string;
  description: string;
  code: string;              // HTML/JS/React code the tenant writes
  props: ComponentPropDef[]; // declared props with types
  events: ComponentEventDef[]; // events the component emits
  version: number;
  createdAt: string;
  updatedAt: string;
}

// ─── Schema helpers ────────────────────────────────────────────────────────────

export interface ComponentPropDef {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  required: boolean;
  defaultValue?: unknown;
  description?: string;
}

export interface ComponentEventDef {
  name: string;              // e.g. 'onChange', 'onSubmit', 'onSelect'
  payloadSchema: ComponentPropDef[];
  description?: string;
}

// ─── postMessage protocol ──────────────────────────────────────────────────────

export interface ComponentMessage {
  type: 'novo:props' | 'novo:event' | 'novo:ready' | 'novo:resize';
  payload: unknown;
}

export interface PropsMessage extends ComponentMessage {
  type: 'novo:props';
  payload: Record<string, unknown>; // current prop values
}

export interface EventMessage extends ComponentMessage {
  type: 'novo:event';
  payload: { eventName: string; data: unknown };
}

// Legacy message format used by existing CustomComponent.tsx
export type IframeMessage =
  | { type: 'NOVO_READY' }
  | { type: 'NOVO_PROPS'; props: Record<string, unknown> }
  | { type: 'NOVO_EVENT'; event: string; payload: unknown }
  | { type: 'NOVO_RESIZE'; height: number }
  | { type: 'NOVO_ERROR'; message: string };
