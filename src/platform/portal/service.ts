/**
 * Customer portal service — token generation, validation, and filtered record access.
 * Uses a simple HMAC-signed JSON token (no external JWT library required).
 */

import { Pool } from 'pg';
import { createHmac, randomBytes } from 'crypto';
import type { PortalConfig, PortalToken } from './types';

const TOKEN_SECRET = process.env['PORTAL_TOKEN_SECRET'] ?? 'portal-dev-secret-change-in-prod';
const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// ─── Token encode/decode ──────────────────────────────────────────────────────

function encodeToken(payload: Omit<PortalToken, 'token'>): string {
  const data = JSON.stringify({
    email: payload.email,
    appId: payload.appId,
    tenantSlug: payload.tenantSlug,
    expiresAt: payload.expiresAt.toISOString(),
    nonce: randomBytes(8).toString('hex'),
  });
  const b64 = Buffer.from(data).toString('base64url');
  const sig = createHmac('sha256', TOKEN_SECRET).update(b64).digest('base64url');
  return `${b64}.${sig}`;
}

function decodeToken(token: string): PortalToken | null {
  try {
    const [b64, sig] = token.split('.');
    if (!b64 || !sig) return null;
    const expected = createHmac('sha256', TOKEN_SECRET).update(b64).digest('base64url');
    if (expected !== sig) return null;
    const payload = JSON.parse(Buffer.from(b64, 'base64url').toString('utf8')) as {
      email: string;
      appId: string;
      tenantSlug: string;
      expiresAt: string;
    };
    return {
      token,
      email: payload.email,
      appId: payload.appId,
      tenantSlug: payload.tenantSlug,
      expiresAt: new Date(payload.expiresAt),
    };
  } catch {
    return null;
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function generatePortalToken(
  email: string,
  appId: string,
  tenantSlug: string,
  _pgPool: Pool,
): Promise<PortalToken> {
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);
  const payload = { email, appId, tenantSlug, expiresAt };
  const token = encodeToken(payload);
  return { token, ...payload };
}

export async function validatePortalToken(token: string): Promise<PortalToken | null> {
  const decoded = decodeToken(token);
  if (!decoded) return null;
  if (decoded.expiresAt < new Date()) return null;
  return decoded;
}

export async function getPortalConfig(appId: string, pgPool: Pool): Promise<PortalConfig | null> {
  const res = await pgPool.query<{ config: PortalConfig; enabled: boolean }>(
    `SELECT config, enabled FROM platform.portal_configs WHERE app_id = $1 LIMIT 1`,
    [appId],
  );
  if (!res.rows[0] || !res.rows[0].enabled) return null;
  return { ...res.rows[0].config, appId, enabled: res.rows[0].enabled };
}

export async function savePortalConfig(
  appId: string,
  config: Omit<PortalConfig, 'appId'>,
  pgPool: Pool,
): Promise<void> {
  await pgPool.query(
    `INSERT INTO platform.portal_configs (app_id, config, enabled)
     VALUES ($1, $2::jsonb, $3)
     ON CONFLICT (app_id) DO UPDATE SET config = $2::jsonb, enabled = $3`,
    [appId, JSON.stringify(config), config.enabled],
  );
}

export async function getPortalRecords(
  portalToken: PortalToken,
  tableApiKey: string,
  pgPool: Pool,
): Promise<Record<string, unknown>[]> {
  const config = await getPortalConfig(portalToken.appId, pgPool);
  if (!config) return [];
  if (!config.allowedTables.includes(tableApiKey)) return [];

  const schema = portalToken.tenantSlug.replace(/[^a-z0-9_]/gi, '_');
  const allowedFields = config.allowedFields[tableApiKey] ?? [];
  const filterField = config.filterField;

  // Build SELECT with only allowed fields
  const selectCols = allowedFields.length > 0
    ? allowedFields.map((f) => JSON.stringify(f)).join(', ')
    : '*';

  const res = await pgPool.query<Record<string, unknown>>(
    `SELECT ${selectCols} FROM ${JSON.stringify(schema)}.${JSON.stringify(tableApiKey)}
     WHERE ${JSON.stringify(filterField)} = $1`,
    [portalToken.email],
  );
  return res.rows;
}
