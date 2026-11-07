/**
 * Fulfilment engine types.
 */

import type { FulfilmentEngineConfig } from '@/platform/contracts';

export type { FulfilmentEngineConfig };

export interface FulfilmentLink {
  id: string;
  tenantSlug: string;
  config: FulfilmentEngineConfig;
  sourceLineTableId: string;
  sourceLineRecordId: string;
  targetLineTableId: string;
  targetLineRecordId: string;
  qtyLinked: number;
  createdAt: Date;
  createdBy: string;
}

export interface FulfilmentStatus {
  sourceLineId: string;
  qtyOrdered: number;
  qtyLinked: number;
  qtyPending: number;
  status: 'open' | 'partial' | 'fulfilled' | 'over';
}

// ─── Spec §1.6 types (api-key-based config) ───────────────────────────────────

export interface FulfilmentConfig {
  id: string;
  appId: string;
  name: string;
  /** Source header table api key */
  sourceTableApiKey: string;
  /** Source child/line table api key */
  sourceLineTableApiKey: string;
  /** Qty field on the source line */
  sourceQtyFieldApiKey: string;
  /** Target header table api key */
  targetTableApiKey: string;
  /** Target child/line table api key */
  targetLineTableApiKey: string;
  /** Qty field on the target line */
  targetQtyFieldApiKey: string;
  /** Field on target line that holds source line id */
  linkFieldApiKey: string;
  /** Optional: status field on source line */
  sourceStatusFieldApiKey?: string;
  /** Status value meaning fully fulfilled */
  fulfilledStatusValue?: string;
  /** Status value meaning partially fulfilled */
  partialStatusValue?: string;
}

/** A persisted link record (api-key-based, matches spec §1.6) */
export interface FulfilmentLinkRecord {
  id: string;
  configId: string;
  appId: string;
  sourceLineId: string;
  targetLineId: string;
  linkedQty: number;
  createdAt: Date;
}

export interface FulfilmentSummary {
  sourceLineId: string;
  orderedQty: number;
  linkedQty: number;
  pendingQty: number;
  status: 'pending' | 'partial' | 'fulfilled';
}
