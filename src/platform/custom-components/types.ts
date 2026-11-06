export interface CustomComponentDefinition {
  id: string
  tenantSlug: string
  name: string
  slug: string
  description: string
  code: string
  props: ComponentPropDef[]
  events: ComponentEventDef[]
  version: number
  createdAt: string
  updatedAt: string
}

export interface ComponentPropDef {
  name: string
  type: 'string' | 'number' | 'boolean' | 'array' | 'object'
  required: boolean
  defaultValue?: unknown
  description?: string
}

/** Wave 11: payloadSchema replaces the old payload: Record<string,string> */
export interface ComponentEventDef {
  name: string
  payloadSchema: ComponentPropDef[]
  description?: string
}

/** Wave 11 novo: prefix postMessage types */
export interface ComponentMessage {
  type: 'novo:props' | 'novo:event' | 'novo:ready' | 'novo:resize'
  payload: unknown
}

export interface PropsMessage extends ComponentMessage {
  type: 'novo:props'
  payload: Record<string, unknown>
}

export interface EventMessage extends ComponentMessage {
  type: 'novo:event'
  payload: { eventName: string; data: unknown }
}

export interface ResizeMessage extends ComponentMessage {
  type: 'novo:resize'
  payload: number
}

export interface ReadyMessage extends ComponentMessage {
  type: 'novo:ready'
  payload: Record<string, never>
}

/** Legacy IframeMessage (kept for backward compat with existing CustomComponent.tsx) */
export type IframeMessage =
  | { type: 'NOVO_PROPS'; props: Record<string, unknown> }
  | { type: 'NOVO_EVENT'; eventName: string; payload: unknown }
  | { type: 'NOVO_READY' }
  | { type: 'NOVO_RESIZE'; height: number }
  | { type: 'NOVO_ERROR'; message: string }

/** Wave 11 app-scoped CustomComponent (stored in custom_components_v2) */
export interface CustomComponent {
  id: string
  appId: string
  name: string
  description?: string
  sourceCode: string
  compiledCode?: string
  propsSchema: ComponentPropDef[]
  eventsSchema: ComponentEventDef[]
  version: number
  storageKey?: string
}
