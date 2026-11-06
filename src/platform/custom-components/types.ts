export interface CustomComponent {
  id: string;
  appId: string;
  name: string;
  description?: string;
  sourceCode: string;
  compiledCode?: string;
  propsSchema: ComponentPropDef[];
  eventsSchema: ComponentEventDef[];
  version: number;
  storageKey?: string;
}
export interface CustomComponentDefinition {
  id: string;
  tenantSlug: string;
  name: string;
  slug: string;
  description: string;
  code: string;
  props: ComponentPropDef[];
  events: ComponentEventDef[];
  version: number;
  createdAt: string;
  updatedAt: string;
}
export interface ComponentPropDef {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  required: boolean;
  defaultValue?: unknown;
  description?: string;
}
export interface ComponentEventDef {
  name: string;
  payloadSchema: ComponentPropDef[];
  description?: string;
}
export interface ComponentMessage {
  type: 'novo:props' | 'novo:event' | 'novo:ready' | 'novo:resize';
  payload: unknown;
}
export interface PropsMessage extends ComponentMessage {
  type: 'novo:props';
  payload: Record<string, unknown>;
}
export interface EventMessage extends ComponentMessage {
  type: 'novo:event';
  payload: { eventName: string; data: unknown };
}
export type IframeMessage =
  | { type: 'NOVO_READY' }
  | { type: 'NOVO_PROPS'; props: Record<string, unknown> }
  | { type: 'NOVO_EVENT'; event: string; payload: unknown }
  | { type: 'NOVO_RESIZE'; height: number }
  | { type: 'NOVO_ERROR'; message: string };
