/**
 * Template marketplace types.
 */

import type { AppPackage } from '../packages/types';

export type TemplateCategory =
  | 'erp'
  | 'crm'
  | 'hrms'
  | 'inventory'
  | 'helpdesk'
  | 'education'
  | 'healthcare'
  | 'manufacturing'
  | 'retail'
  | 'custom';

export interface AppTemplate {
  id: string;
  name: string;
  slug: string;
  description: string;
  category: TemplateCategory;
  icon: string;
  previewImages: string[];
  features: string[];        // bullet points shown in marketplace
  package: AppPackage;       // the actual app definition
  version: string;
  author: string;
  downloads: number;
}
