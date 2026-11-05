/**
 * Builder domain types
 */

export interface BuilderApp {
  id: string;
  tenantSlug: string;
  name: string;
  description?: string;
  icon?: string;
  color?: string;
  publishedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface BuilderNavSection {
  key: string;
  label: string;
  items: BuilderNavItem[];
  defaultOpen?: boolean;
}

export interface BuilderNavItem {
  key: string;
  label: string;
  href: string;
  icon: string;
}
