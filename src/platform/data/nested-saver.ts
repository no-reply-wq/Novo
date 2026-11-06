/**
 * Saves a parent record and all its children in a single transaction.
 *
 * - Upserts parent first, then each child group in order
 * - Deletes rows that existed before but are absent from input
 * - Enforces cascade rules on delete
 * - All within one DB transaction
 */

import { Pool, PoolClient } from 'pg';
import { withTenantTx, RlsClaims } from './client';
import type { ChildTableConfig } from './child-tables';
import type { RecordWithChildren } from './nested-fetcher';
import type { CascadeRule } from './relations';

export interface ChildRowInput {
  id?: string;    // present = update, absent = insert
  data: Record<string, unknown>;
  children?: ChildGroupInput[];
}

export interface ChildGroupInput {
  config: ChildTableConfig;
  rows: ChildRowInput[];
}

export interface RecordWithChildrenInput {
  id?: string;
  data: Record<string, unknown>;
  children?: ChildGroupInput[];
}

export interface SaveOptions {
  pool: Pool;
  claims: RlsClaims;
  cascadeOnDelete?: CascadeRule; // default: 'restrict' per child group config
}

export async function saveRecordWithChildren(
  tenantSlug: string,
  tableId: string,
  input: RecordWithChildrenInput,
  opts: SaveOptions,
): Promise<RecordWithChildren> {
  return withTenantTx(opts.pool, tenantSlug, opts.claims, async (client, schema) => {
    // 1. Upsert parent
    const parentId = await upsertRecord(client, schema, tableId, input.id, input.data);

    // 2. Save children recursively
    const savedChildren = await saveChildGroups(
      client,
      schema,
      tableId,
      parentId,
      input.children ?? [],
      opts,
    );

    // 3. Read back the saved parent
    const parentRow = await client.query<Record<string, unknown>>(
      `SELECT * FROM ${q(schema)}.${q(tableId)} WHERE id = $1`,
      [parentId],
    );

    return {
      id: parentId,
      tableId,
      data: parentRow.rows[0],
      children: savedChildren,
    };
  });
}

async function saveChildGroups(
  client: PoolClient,
  schema: string,
  _parentTableId: string,
  parentId: string,
  groups: ChildGroupInput[],
  opts: SaveOptions,
): Promise<import('./nested-fetcher').ChildGroup[]> {
  const result: import('./nested-fetcher').ChildGroup[] = [];

  for (const group of groups) {
    const { config } = group;
    const inputIds = new Set(group.rows.filter((r) => r.id).map((r) => r.id as string));

    // Find existing child IDs for this parent
    const existing = await client.query<{ id: string }>(
      `SELECT id FROM ${q(schema)}.${q(config.childTableId)} WHERE ${q(config.parentField)} = $1`,
      [parentId],
    );
    const existingIds = existing.rows.map((r) => r.id);

    // IDs to delete = existing minus those present in input
    const toDelete = existingIds.filter((id) => !inputIds.has(id));

    if (toDelete.length > 0) {
      await deleteChildren(client, schema, config, toDelete, opts);
    }

    const savedRows: import('./nested-fetcher').RecordWithChildren[] = [];

    for (let i = 0; i < group.rows.length; i++) {
      const row = group.rows[i];
      const rowData: Record<string, unknown> = {
        ...row.data,
        [config.parentField]: parentId,
      };

      if (config.allowReorder) {
        rowData['display_order'] = i;
      }

      const childId = await upsertRecord(client, schema, config.childTableId, row.id, rowData);

      const grandchildren = await saveChildGroups(
        client,
        schema,
        config.childTableId,
        childId,
        row.children ?? [],
        opts,
      );

      const savedRow = await client.query<Record<string, unknown>>(
        `SELECT * FROM ${q(schema)}.${q(config.childTableId)} WHERE id = $1`,
        [childId],
      );

      savedRows.push({
        id: childId,
        tableId: config.childTableId,
        data: savedRow.rows[0],
        children: grandchildren,
      });
    }

    result.push({ config, rows: savedRows });
  }

  return result;
}

async function deleteChildren(
  client: PoolClient,
  schema: string,
  config: ChildTableConfig,
  ids: string[],
  opts: SaveOptions,
): Promise<void> {
  const rule = opts.cascadeOnDelete ?? 'restrict';

  if (rule === 'restrict') {
    // Check if any of these have their own children
    // For simplicity we check the same table for self-refs; callers with deeper
    // configs should pass cascade='cascade' explicitly.
    for (const id of ids) {
      const childCheck = await client.query<{ cnt: string }>(
        `SELECT COUNT(*) AS cnt FROM ${q(schema)}.${q(config.childTableId)}
         WHERE ${q(config.parentField)} = $1`,
        [id],
      );
      if (parseInt(childCheck.rows[0].cnt, 10) > 0) {
        throw new Error(
          `Cannot delete ${config.childTableId} row ${id}: child records exist (cascade rule: restrict)`,
        );
      }
    }
  }

  if (rule === 'cascade') {
    // Recursively delete grandchildren first
    for (const id of ids) {
      const grandchildren = await client.query<{ id: string }>(
        `SELECT id FROM ${q(schema)}.${q(config.childTableId)}
         WHERE ${q(config.parentField)} = $1`,
        [id],
      );
      if (grandchildren.rows.length > 0) {
        await deleteChildren(
          client,
          schema,
          { ...config, parentTableId: config.childTableId },
          grandchildren.rows.map((r) => r.id),
          opts,
        );
      }
    }
  }

  if (rule === 'set_null') {
    await client.query(
      `UPDATE ${q(schema)}.${q(config.childTableId)}
       SET ${q(config.parentField)} = NULL
       WHERE id = ANY($1::uuid[])`,
      [ids],
    );
    return;
  }

  // Default: actually delete
  await client.query(
    `DELETE FROM ${q(schema)}.${q(config.childTableId)} WHERE id = ANY($1::uuid[])`,
    [ids],
  );
}

async function upsertRecord(
  client: PoolClient,
  schema: string,
  tableId: string,
  id: string | undefined,
  data: Record<string, unknown>,
): Promise<string> {
  const keys = Object.keys(data).filter((k) => k !== 'id');
  const values = keys.map((k) => data[k]);

  if (id) {
    // Update
    if (keys.length === 0) return id;
    const setClauses = keys.map((k, i) => `${q(k)} = $${i + 2}`).join(', ');
    await client.query(
      `UPDATE ${q(schema)}.${q(tableId)} SET ${setClauses} WHERE id = $1`,
      [id, ...values],
    );
    return id;
  }

  // Insert
  if (keys.length === 0) {
    const res = await client.query<{ id: string }>(
      `INSERT INTO ${q(schema)}.${q(tableId)} DEFAULT VALUES RETURNING id`,
    );
    return res.rows[0].id;
  }

  const colList = keys.map((k) => q(k)).join(', ');
  const valPlaceholders = keys.map((_, i) => `$${i + 1}`).join(', ');
  const res = await client.query<{ id: string }>(
    `INSERT INTO ${q(schema)}.${q(tableId)} (${colList}) VALUES (${valPlaceholders}) RETURNING id`,
    values,
  );
  return res.rows[0].id;
}

function q(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}
