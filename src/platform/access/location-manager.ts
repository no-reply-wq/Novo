/**
 * location-manager.ts
 *
 * LocationDef tree storage and user→location membership queries.
 * Stores locations in public.locations (see migration 002_locations.sql).
 */

import type { LocationDef } from '@/platform/contracts';

/** Minimal DB client interface — matches what Agent A's data layer provides */
export interface PgClient {
  query<T extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
    params?: unknown[],
  ): Promise<{ rows: T[] }>;
}

export class NotConfiguredError extends Error {
  constructor(component: string) {
    super(`${component} is not configured. Provide a valid PgClient.`);
    this.name = 'NotConfiguredError';
  }
}

export class LocationManager {
  constructor(private readonly db: PgClient) {}

  /** Insert or update a location */
  async upsertLocation(loc: Omit<LocationDef, 'createdAt' | 'updatedAt'>): Promise<LocationDef> {
    const { rows } = await this.db.query<{
      id: string;
      app_id: string;
      parent_id: string | null;
      code: string;
      name: string;
      metadata: Record<string, unknown> | null;
      created_at: Date;
      updated_at: Date;
    }>(
      `INSERT INTO public.locations (id, app_id, parent_id, code, name, metadata)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (id) DO UPDATE SET
         parent_id = EXCLUDED.parent_id,
         code      = EXCLUDED.code,
         name      = EXCLUDED.name,
         metadata  = EXCLUDED.metadata,
         updated_at = NOW()
       RETURNING *`,
      [
        loc.id,
        loc.appId,
        loc.parentId ?? null,
        loc.code,
        loc.name,
        loc.metadata ? JSON.stringify(loc.metadata) : null,
      ],
    );
    const row = rows[0];
    return rowToLocationDef(row);
  }

  /** Assign a user to a location */
  async assignUserLocation(userId: string, locationId: string): Promise<void> {
    await this.db.query(
      `INSERT INTO public.user_locations (user_id, location_id)
       VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [userId, locationId],
    );
  }

  /** Remove a user from a location */
  async removeUserLocation(userId: string, locationId: string): Promise<void> {
    await this.db.query(
      `DELETE FROM public.user_locations WHERE user_id = $1 AND location_id = $2`,
      [userId, locationId],
    );
  }

  /**
   * Get all location ids the user belongs to, including all ancestor locations
   * (walk up the tree so that a policy on a parent location also applies).
   */
  async getUserLocations(userId: string): Promise<string[]> {
    // First get the user's direct location ids
    const { rows: directRows } = await this.db.query<{ location_id: string }>(
      `SELECT location_id FROM public.user_locations WHERE user_id = $1`,
      [userId],
    );
    const directIds = directRows.map((r) => r.location_id);
    if (directIds.length === 0) return [];

    // Walk up each location's ancestor chain using a recursive CTE
    const { rows } = await this.db.query<{ id: string }>(
      `WITH RECURSIVE ancestors AS (
         SELECT id, parent_id FROM public.locations WHERE id = ANY($1::uuid[])
         UNION ALL
         SELECT l.id, l.parent_id
         FROM public.locations l
         JOIN ancestors a ON l.id = a.parent_id
       )
       SELECT DISTINCT id FROM ancestors`,
      [directIds],
    );
    return rows.map((r) => r.id);
  }

  /**
   * Returns the given location id plus all its descendant ids (recursive).
   */
  async resolveLocationTree(locationId: string): Promise<string[]> {
    const { rows } = await this.db.query<{ id: string }>(
      `WITH RECURSIVE descendants AS (
         SELECT id, parent_id FROM public.locations WHERE id = $1
         UNION ALL
         SELECT l.id, l.parent_id
         FROM public.locations l
         JOIN descendants d ON l.parent_id = d.id
       )
       SELECT DISTINCT id FROM descendants`,
      [locationId],
    );
    return rows.map((r) => r.id);
  }

  /** Fetch a single location by id */
  async getLocation(id: string): Promise<LocationDef | null> {
    const { rows } = await this.db.query<{
      id: string;
      app_id: string;
      parent_id: string | null;
      code: string;
      name: string;
      metadata: Record<string, unknown> | null;
      created_at: Date;
      updated_at: Date;
    }>(`SELECT * FROM public.locations WHERE id = $1`, [id]);
    if (rows.length === 0) return null;
    return rowToLocationDef(rows[0]);
  }

  /** List all locations for an app */
  async listLocations(appId: string): Promise<LocationDef[]> {
    const { rows } = await this.db.query<{
      id: string;
      app_id: string;
      parent_id: string | null;
      code: string;
      name: string;
      metadata: Record<string, unknown> | null;
      created_at: Date;
      updated_at: Date;
    }>(`SELECT * FROM public.locations WHERE app_id = $1 ORDER BY code`, [appId]);
    return rows.map(rowToLocationDef);
  }

  /** Delete a location (cascades to user_locations via FK) */
  async deleteLocation(id: string): Promise<void> {
    await this.db.query(`DELETE FROM public.locations WHERE id = $1`, [id]);
  }
}

function rowToLocationDef(row: {
  id: string;
  app_id: string;
  parent_id: string | null;
  code: string;
  name: string;
  metadata: Record<string, unknown> | null;
  created_at: Date;
  updated_at: Date;
}): LocationDef {
  return {
    id: row.id,
    appId: row.app_id,
    parentId: row.parent_id ?? undefined,
    code: row.code,
    name: row.name,
    metadata: row.metadata ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
