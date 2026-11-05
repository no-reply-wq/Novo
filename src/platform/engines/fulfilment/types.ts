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
