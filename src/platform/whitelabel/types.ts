export interface WhitelabelConfig {
  tenantSlug: string;
  customDomain?: string;
  logoUrl?: string;
  faviconUrl?: string;
  primaryColor?: string;
  companyName?: string;
  supportEmail?: string;
  hideNovoBranding: boolean;
  customCss?: string;
}
