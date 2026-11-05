/**
 * Table, relation and record-level definitions.
 *
 * RULE: Sub-agents may not change this file. Changes go through the Lead.
 */

import type { FieldDef } from './fields';

// ─── RelationDef ─────────────────────────────────────────────────────────────

export interface RelationDef {
  id: string;
  name: string;
  sourceTableId: string;
  targetTableId: string;
  type: 'one_to_many' | 'many_to_many' | 'self';

  // For one_to_many: the FK lives on targetTable (the "many" side)
  // For many_to_many: a junction table is auto-created
  foreignKeyFieldId?: string;  // FieldDef.id of the lookup field on targetTable
  junctionTableId?: string;    // auto-generated for many_to_many

  /**
   * Nesting: when true, the target rows are displayed inline as a child table
   * within the parent's form/page. Multiple child tables per parent are allowed.
   */
  nested?: boolean;
  rank?: number;               // display order among siblings

  cascadeDelete?: 'restrict' | 'cascade' | 'set_null';
  createdAt: Date;
  updatedAt: Date;
}

// ─── SoftDelete config ────────────────────────────────────────────────────────

export interface SoftDeleteConfig {
  enabled: boolean;
  requireReason: boolean;         // show a mandatory reason dialog
  recycleBinRetentionDays?: number; // 0 = keep forever
}

// ─── Audit / versions config ──────────────────────────────────────────────────

export interface AuditConfig {
  enabled: boolean;               // log field-level diffs
  versionsEnabled?: boolean;      // keep named record versions (R0, R1…)
  versionApprovalRule?: string;   // expression: who may approve a version
}

// ─── Built-in engines ────────────────────────────────────────────────────────

export interface StockEngineConfig {
  enabled: boolean;
  itemFieldId: string;             // lookup → item/product table
  locationFieldId: string;         // lookup → location table
  qtyFieldId: string;              // number field: qty moved
  direction: 'in' | 'out' | 'expr'; // 'expr' evaluates directionExpr
  directionExpr?: string;          // expression returning 'in' | 'out'
  triggerStatus?: string;          // status value that triggers the movement
  batchTrackingFieldId?: string;   // optional: batch/lot field
  drawDownMethod?: 'FIFO' | 'FEFO';
}

export interface FulfilmentEngineConfig {
  enabled: boolean;
  sourceTableId: string;           // e.g. "indent"
  sourceLineTableId: string;       // e.g. "indent_line"
  targetLineTableId: string;       // e.g. "po_line"
  qtyOrderedFieldId: string;
  qtyReceivedFieldId: string;
  statusFieldId: string;           // updated automatically
}

export interface BomEngineConfig {
  enabled: boolean;
  recipeTableId: string;
  itemFieldId: string;
  qtyFieldId: string;
  unitFieldId?: string;
}

// ─── TableDef ────────────────────────────────────────────────────────────────

/**
 * Complete definition of one table within an app.
 *
 * "Publishing" a TableDef causes Agent A's migration engine to apply the
 * minimal ALTER TABLE / CREATE TABLE DDL inside a transaction.
 */
export interface TableDef {
  id: string;
  appId: string;
  name: string;             // human-readable ("Purchase Order")
  apiKey: string;           // snake_case table name suffix ("purchase_order")
  icon?: string;
  description?: string;

  fields: FieldDef[];
  relations: RelationDef[];

  // Record lifecycle
  softDelete?: SoftDeleteConfig;
  audit?: AuditConfig;

  // Built-in engines (each is optional and independently toggled)
  stockEngine?: StockEngineConfig;
  fulfilmentEngine?: FulfilmentEngineConfig;
  bomEngine?: BomEngineConfig;

  // Comments and attachments (platform-managed, no extra config needed)
  commentsEnabled?: boolean;
  attachmentsEnabled?: boolean;

  // Default sort / display
  defaultSortFieldId?: string;
  defaultSortDir?: 'asc' | 'desc';
  primaryDisplayFieldId?: string;   // used as the label in lookup dropdowns

  // Versioning
  schemaVersion: number;            // incremented each time fields/relations change

  createdAt: Date;
  updatedAt: Date;
  publishedAt?: Date;
}

// ─── AppDefinition ───────────────────────────────────────────────────────────

/**
 * Root container: everything that belongs to one tenant-built app.
 *
 * An app is published as a bundle (Draft → Preview → Published).
 * The bundle includes tables, pages, workflows, scripts, rules and templates.
 */
export interface AppDefinition {
  id: string;
  tenantId: string;
  name: string;             // "Colorplas ERP", "Learning LMS", …
  slug: string;             // URL-safe identifier
  description?: string;
  iconUrl?: string;
  version: string;          // semver, e.g. "1.0.0"
  status: 'draft' | 'preview' | 'published';

  tables: TableDef[];

  // References to other contract types (stored separately)
  pageIds: string[];
  workflowIds: string[];
  scriptIds: string[];
  connectorIds: string[];
  docTemplateIds: string[];
  themeId?: string;

  // Environment linkage
  environment: 'development' | 'staging' | 'production';
  parentAppId?: string;      // set when cloned from another app

  createdAt: Date;
  updatedAt: Date;
  publishedAt?: Date;
}
