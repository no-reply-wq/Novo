import { Pool } from "pg";
import type { CustomComponentDef } from "./types";

interface CCDefRow {
  id: string;
  app_id: string;
  name: string;
  api_key: string;
  description: string | null;
  version: number;
  code: string;
  props_schema: unknown;
  preview_props: unknown | null;
  created_at: string;
  updated_at: string;
}

function rowToDef(r: CCDefRow): CustomComponentDef {
  return {
    id: r.id,
    appId: r.app_id,
    name: r.name,
    apiKey: r.api_key,
    description: r.description ?? undefined,
    version: r.version,
    code: r.code,
    propsSchema: typeof r.props_schema === "string"
      ? JSON.parse(r.props_schema) as CustomComponentDef["propsSchema"]
      : r.props_schema as CustomComponentDef["propsSchema"],
    previewProps: r.preview_props
      ? (typeof r.preview_props === "string"
        ? JSON.parse(r.preview_props) as Record<string, unknown>
        : r.preview_props as Record<string, unknown>)
      : undefined,
    createdAt: new Date(r.created_at),
    updatedAt: new Date(r.updated_at),
  };
}

const TABLE = "platform.custom_component_defs";

export async function saveComponent(
  def: Omit<CustomComponentDef, "id" | "version" | "createdAt" | "updatedAt">,
  pgPool: Pool,
): Promise<CustomComponentDef> {
  const r = await pgPool.query<CCDefRow>(
    `INSERT INTO ${TABLE} (app_id, name, api_key, description, code, props_schema, preview_props)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb)
     ON CONFLICT (app_id, api_key) DO UPDATE SET
       name = EXCLUDED.name,
       description = EXCLUDED.description,
       code = EXCLUDED.code,
       props_schema = EXCLUDED.props_schema,
       preview_props = EXCLUDED.preview_props,
       version = ${TABLE}.version + 1,
       updated_at = now()
     RETURNING id, app_id, name, api_key, description, version, code,
               props_schema::text, preview_props::text, created_at, updated_at`,
    [
      def.appId,
      def.name,
      def.apiKey,
      def.description ?? null,
      def.code,
      JSON.stringify(def.propsSchema),
      def.previewProps != null ? JSON.stringify(def.previewProps) : null,
    ],
  );
  return rowToDef(r.rows[0]!);
}

export async function listComponents(
  appId: string,
  pgPool: Pool,
): Promise<CustomComponentDef[]> {
  const r = await pgPool.query<CCDefRow>(
    `SELECT id, app_id, name, api_key, description, version, code,
            props_schema::text, preview_props::text, created_at, updated_at
     FROM ${TABLE}
     WHERE app_id = $1
     ORDER BY name`,
    [appId],
  );
  return r.rows.map(rowToDef);
}

export async function getComponent(
  id: string,
  pgPool: Pool,
): Promise<CustomComponentDef | null> {
  const r = await pgPool.query<CCDefRow>(
    `SELECT id, app_id, name, api_key, description, version, code,
            props_schema::text, preview_props::text, created_at, updated_at
     FROM ${TABLE}
     WHERE id = $1`,
    [id],
  );
  if (r.rows.length === 0) return null;
  return rowToDef(r.rows[0]!);
}

export async function deleteComponent(
  id: string,
  pgPool: Pool,
): Promise<void> {
  await pgPool.query(`DELETE FROM ${TABLE} WHERE id = $1`, [id]);
}
