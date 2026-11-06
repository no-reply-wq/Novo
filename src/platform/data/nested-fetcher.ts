/**
 * Fetches a record with all its nested children to any depth.
 *
 * Uses sequential queries per level (avoids recursive CTE complexity
 * with dynamic table names) while respecting RLS via withTenantTx.
 */

import { Pool } from 'pg';
import { withTenantTx, RlsClaims } from './client';
import type { ChildTableConfig } from './child-tables';

export interface RecordWithChildren {
  id: string;
  tableId: string;
  data: Record<string, unknown>;
  children: ChildGroup[];
}

export interface ChildGroup {
  config: ChildTableConfig;
  rows: RecordWithChildren[];
}

export interface FetchOptions {
  pool: Pool;
  claims: RlsClaims;
  /**
   * Child table configs for the root table (and any nested tables).
   * Caller is responsible for loading these from platform.child_table_configs.
   */
  childConfigs: Map<string, ChildTableConfig[]>; // keyed by tableId
  /**
   * Max depth to fetch. If undefined, fetches all levels present in childConfigs.
   */
  maxDepth?: number;
}

export async function fetchRecordWithChildren(
  tenantSlug: string,
  tableId: string,
  recordId: string,
  opts: FetchOptions,
): Promise<RecordWithChildren> {
  return withTenantTx(opts.pool, tenantSlug, opts.claims, async (client, schema) => {
    const parentRow = await client.query<Record<string, unknown>>(
      `SELECT * FROM ${pgSchema(schema)}.${pgIdent(tableId)} WHERE id = $1 AND (deleted_at IS NULL OR TRUE)`,
      [recordId],
    );

    if (parentRow.rows.length === 0) {
      throw new Error(`Record ${recordId} not found in table ${tableId}`);
    }

    const data = parentRow.rows[0];

    async function fetchChildren(
      parentTableId: string,
      parentId: string,
      currentDepth: number,
    ): Promise<ChildGroup[]> {
      const configs = opts.childConfigs.get(parentTableId) ?? [];
      if (configs.length === 0) return [];

      const groups: ChildGroup[] = [];

      for (const config of configs.sort((a, b) => a.displayOrder - b.displayOrder)) {
        const shouldDescend =
          opts.maxDepth === undefined || currentDepth < opts.maxDepth;

        const childRows = await client.query<Record<string, unknown>>(
          `SELECT * FROM ${pgSchema(schema)}.${pgIdent(config.childTableId)}
           WHERE ${pgIdent(config.parentField)} = $1
           AND (deleted_at IS NULL OR TRUE)
           ORDER BY ${config.allowReorder ? 'display_order ASC, ' : ''}created_at ASC`,
          [parentId],
        );

        const rows: RecordWithChildren[] = [];

        for (const row of childRows.rows) {
          const childId = String(row['id']);
          const grandchildren: ChildGroup[] = shouldDescend
            ? await fetchChildren(config.childTableId, childId, currentDepth + 1)
            : [];

          rows.push({
            id: childId,
            tableId: config.childTableId,
            data: row,
            children: grandchildren,
          });
        }

        groups.push({ config, rows });
      }

      return groups;
    }

    const id = String(data['id']);
    const children = await fetchChildren(tableId, id, 0);

    return { id, tableId, data, children };
  });
}

function pgSchema(schema: string): string {
  return `"${schema.replace(/"/g, '""')}"`;
}

function pgIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}
