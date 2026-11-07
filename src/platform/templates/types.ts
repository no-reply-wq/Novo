/**
 * Template types for the Novo platform template gallery.
 */

import type { AppBundle } from '../lifecycle/types';

export interface AppTemplate {
  id: string;
  name: string;
  description: string;
  category: 'erp' | 'hrms' | 'lms' | 'crm' | 'inventory' | 'custom';
  industry?: string;
  icon: string;        // emoji
  color: string;       // hex
  features: string[];  // bullet points shown in gallery
  bundle: AppBundle;   // from lifecycle/types.ts (the full app definition)
  previewImages?: string[]; // URLs or base64
  createdAt: string;
}
