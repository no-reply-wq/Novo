export interface Portal {
  id: string
  appId: string
  tenantSlug: string
  name: string
  slug: string              // e.g. "customer-portal"
  type: 'customer' | 'vendor' | 'partner' | 'public'
  loginEnabled: boolean
  publicPages: string[]     // page slugs accessible without login
  welcomeMessage?: string
  logoUrl?: string
  themeId?: string          // can have its own theme
  allowedTableAccess: PortalTableAccess[]
  createdAt: string
}

export interface PortalTableAccess {
  tableId: string
  canRead: boolean
  canCreate: boolean
  canUpdate: boolean        // only own records
  rowFilter?: string        // expression: "record.client_id = user.id"
}

export interface PortalUser {
  id: string
  portalId: string
  tenantSlug: string
  email: string
  name: string
  passwordHash: string
  metadata: Record<string, unknown>  // e.g. { clientId: 'xxx' }
  isActive: boolean
  createdAt: string
  lastLoginAt?: string
}
