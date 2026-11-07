/**
 * Script versioning — publish, list, and roll back tenant script versions.
 */

import { Pool } from 'pg';
import { ScriptDef } from '../contracts/rules';

export async function publishScriptVersion(pool: Pool, scriptDef: ScriptDef): Promise<ScriptDef> {
  const client = await pool.connect();
  try {
    // Get the next version number
    const versionRes = await client.query<{ max_version: number | null }>(
      `SELECT MAX(version) AS max_version FROM public.script_versions WHERE script_id = $1`,
      [scriptDef.id],
    );
    const nextVersion = (versionRes.rows[0].max_version ?? 0) + 1;

    const now = new Date();
    await client.query(
      `INSERT INTO public.script_versions (script_id, app_id, version, code, published_at, published_by)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        scriptDef.id,
        scriptDef.appId,
        nextVersion,
        scriptDef.code,
        now,
        'system', // callers should pass the actual userId
      ],
    );

    return {
      ...scriptDef,
      version: nextVersion,
      publishedAt: now,
      updatedAt: now,
    };
  } finally {
    client.release();
  }
}

export async function getScriptVersions(pool: Pool, scriptId: string): Promise<ScriptDef[]> {
  const client = await pool.connect();
  try {
    const res = await client.query<{
      id: string;
      script_id: string;
      app_id: string;
      version: number;
      code: string;
      published_at: Date;
      published_by: string;
    }>(
      `SELECT * FROM public.script_versions WHERE script_id = $1 ORDER BY version DESC`,
      [scriptId],
    );

    return res.rows.map((row) => ({
      id: row.script_id,
      appId: row.app_id,
      name: row.script_id, // name not stored separately; use script_id as placeholder
      language: 'javascript' as const,
      code: row.code,
      version: row.version,
      createdAt: row.published_at,
      updatedAt: row.published_at,
      publishedAt: row.published_at,
    }));
  } finally {
    client.release();
  }
}

export async function rollbackScript(pool: Pool, scriptId: string, version: number): Promise<ScriptDef> {
  const client = await pool.connect();
  try {
    const res = await client.query<{
      id: string;
      script_id: string;
      app_id: string;
      version: number;
      code: string;
      published_at: Date;
      published_by: string;
    }>(
      `SELECT * FROM public.script_versions WHERE script_id = $1 AND version = $2`,
      [scriptId, version],
    );

    if (res.rows.length === 0) {
      throw new Error(`No version ${version} found for script ${scriptId}`);
    }

    const row = res.rows[0];
    return {
      id: row.script_id,
      appId: row.app_id,
      name: row.script_id,
      language: 'javascript' as const,
      code: row.code,
      version: row.version,
      createdAt: row.published_at,
      updatedAt: row.published_at,
      publishedAt: row.published_at,
    };
  } finally {
    client.release();
  }
}
