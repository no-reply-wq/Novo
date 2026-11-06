export interface CustomComponentDefinition {
  id: string
  tenantSlug: string
  name: string
  slug: string
  description: string
  code: string              // HTML/JS/React code the tenant writes
  props: ComponentPropDef[] // declared props with types
  events: ComponentEventDef[] // events the component emits
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

export interface ComponentEventDef {
  name: string              // e.g. "onSelect", "onScan"
  payload: Record<string, string>  // { itemId: 'string', quantity: 'number' }
  description?: string
}

// postMessage protocol between iframe and parent
export type IframeMessage =
  | { type: 'NOVO_READY' }                        // iframe → parent: component loaded
  | { type: 'NOVO_PROPS'; props: Record<string, unknown> }  // parent → iframe: send props
  | { type: 'NOVO_EVENT'; event: string; payload: unknown } // iframe → parent: component fired event
  | { type: 'NOVO_RESIZE'; height: number }        // iframe → parent: request height
  | { type: 'NOVO_ERROR'; message: string }        // iframe → parent: component error
