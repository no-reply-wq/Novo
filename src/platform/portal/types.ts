export interface PortalConfig {
  appId: string;
  enabled: boolean;
  allowedTables: string[];         // which tables customers can view
  filterField: string;             // field to filter records by (e.g. 'customer_email')
  allowedFields: Record<string, string[]>;  // tableApiKey -> visible field apiKeys
  branding?: {
    logoUrl?: string;
    primaryColor?: string;
    companyName?: string;
  };
}

export interface PortalToken {
  token: string;
  email: string;          // customer's email
  appId: string;
  tenantSlug: string;
  expiresAt: Date;
}
