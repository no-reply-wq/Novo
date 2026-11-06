/**
 * BigQuery reader — runs queries via the BigQuery REST API v2.
 * No googleapis SDK — raw fetch with service-account JWT auth.
 */

import { pgPool } from '@/lib/db/client';
import { decryptSecret } from '../secrets';
import { NotConfiguredError } from '../secrets/manager';
import { ServiceAccountJson } from '../sheets/types';
import { getAccessToken } from '../sheets/auth';

const BQ_SCOPE = 'https://www.googleapis.com/auth/bigquery.readonly';
const BQ_BASE = 'https://bigquery.googleapis.com/bigquery/v2';
const DEFAULT_MAX_ROWS = 1000;
const POLL_INTERVAL_MS = 1000;
const POLL_TIMEOUT_MS = 120_000;

// ─── Types ─────────────────────────────────────────────────────────────────────

interface BigQueryField {
  name: string;
  type: string;
  mode?: string;
  fields?: BigQueryField[];
}

interface BigQuerySchema {
  fields: BigQueryField[];
}

interface BigQueryCell {
  v: string | null | BigQueryCell[];
}

interface BigQueryRow {
  f: BigQueryCell[];
}

interface BigQueryJobResponse {
  jobReference: { jobId: string; projectId: string };
  status: { state: string; errorResult?: { message: string } };
}

interface BigQueryQueryResultsResponse {
  schema: BigQuerySchema;
  rows?: BigQueryRow[];
  totalRows?: string;
  pageToken?: string;
  jobComplete: boolean;
}

// ─── Internal helpers ──────────────────────────────────────────────────────────

async function loadServiceAccount(tenantSlug: string): Promise<ServiceAccountJson> {
  const result = await pgPool.query<{ config: Record<string, string> }>(
    `SELECT config FROM platform.integration_configs
     WHERE tenant_slug = $1 AND type = 'bigquery' AND enabled = true
     LIMIT 1`,
    [tenantSlug]
  );

  if (result.rows.length === 0) {
    throw new NotConfiguredError(
      `No enabled BigQuery integration found for tenant: ${tenantSlug}`
    );
  }

  const raw = result.rows[0].config;
  if (!raw['serviceAccountJson']) {
    throw new NotConfiguredError(
      `BigQuery integration for tenant "${tenantSlug}" is missing serviceAccountJson`
    );
  }

  const decrypted = decryptSecret(raw['serviceAccountJson'], tenantSlug);
  try {
    return JSON.parse(decrypted) as ServiceAccountJson;
  } catch {
    throw new NotConfiguredError(
      `BigQuery integration for tenant "${tenantSlug}" has invalid serviceAccountJson`
    );
  }
}

function mapValue(value: BigQueryCell['v'], fieldType: string): unknown {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value)) return value.map((v) => mapValue(v.v, fieldType));
  switch (fieldType) {
    case 'INTEGER':
    case 'INT64':
      return parseInt(String(value), 10);
    case 'FLOAT':
    case 'FLOAT64':
    case 'NUMERIC':
    case 'BIGNUMERIC':
      return parseFloat(String(value));
    case 'BOOLEAN':
    case 'BOOL':
      return String(value).toLowerCase() === 'true';
    default:
      return String(value);
  }
}

function rowsFromResult(
  schema: BigQuerySchema,
  rawRows: BigQueryRow[]
): Record<string, unknown>[] {
  return rawRows.map((row) => {
    const record: Record<string, unknown> = {};
    schema.fields.forEach((field, idx) => {
      record[field.name] = mapValue(row.f[idx]?.v ?? null, field.type);
    });
    return record;
  });
}

async function pollJob(
  projectId: string,
  jobId: string,
  token: string
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < POLL_TIMEOUT_MS) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));

    const url = `${BQ_BASE}/projects/${projectId}/jobs/${jobId}?fields=status`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`BigQuery job poll error ${res.status}: ${text}`);
    }

    const job = (await res.json()) as BigQueryJobResponse;
    if (job.status.errorResult) {
      throw new Error(`BigQuery job failed: ${job.status.errorResult.message}`);
    }
    if (job.status.state === 'DONE') {
      return;
    }
  }
  throw new Error(`BigQuery job timed out after ${POLL_TIMEOUT_MS}ms`);
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function runBigQuerySQL(params: {
  tenantSlug: string;
  sql: string;
  params?: Record<string, unknown>;
  maxRows?: number;
}): Promise<{ columns: string[]; rows: Record<string, unknown>[]; totalRows: number }> {
  const { tenantSlug, sql, maxRows = DEFAULT_MAX_ROWS } = params;

  const sa = await loadServiceAccount(tenantSlug);
  const token = await getAccessToken(sa, BQ_SCOPE);
  const projectId = sa.project_id;

  // ── Create job ───────────────────────────────────────────────────────────────
  const jobUrl = `${BQ_BASE}/projects/${projectId}/jobs`;
  const jobRes = await fetch(jobUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      configuration: {
        query: {
          query: sql,
          useLegacySql: false,
        },
      },
    }),
  });

  if (!jobRes.ok) {
    const text = await jobRes.text();
    throw new Error(`BigQuery job creation error ${jobRes.status}: ${text}`);
  }

  const job = (await jobRes.json()) as BigQueryJobResponse;
  const jobId = job.jobReference.jobId;

  // ── Poll for completion ───────────────────────────────────────────────────────
  if (job.status.errorResult) {
    throw new Error(`BigQuery job failed: ${job.status.errorResult.message}`);
  }
  if (job.status.state !== 'DONE') {
    await pollJob(projectId, jobId, token);
  }

  // ── Fetch results ─────────────────────────────────────────────────────────────
  const resultsUrl =
    `${BQ_BASE}/projects/${projectId}/queries/${jobId}` +
    `?maxResults=${maxRows}&timeoutMs=10000`;

  const resultsRes = await fetch(resultsUrl, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!resultsRes.ok) {
    const text = await resultsRes.text();
    throw new Error(`BigQuery results fetch error ${resultsRes.status}: ${text}`);
  }

  const data = (await resultsRes.json()) as BigQueryQueryResultsResponse;
  const schema = data.schema ?? { fields: [] };
  const rawRows = data.rows ?? [];

  const columns = schema.fields.map((f) => f.name);
  const rows = rowsFromResult(schema, rawRows);
  const totalRows = parseInt(data.totalRows ?? '0', 10);

  return { columns, rows, totalRows };
}

export async function listBigQueryDatasets(params: {
  tenantSlug: string;
}): Promise<string[]> {
  const { tenantSlug } = params;
  const sa = await loadServiceAccount(tenantSlug);
  const token = await getAccessToken(sa, BQ_SCOPE);
  const projectId = sa.project_id;

  const url = `${BQ_BASE}/projects/${projectId}/datasets`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`BigQuery list datasets error ${res.status}: ${text}`);
  }

  const data = (await res.json()) as {
    datasets?: Array<{ datasetReference: { datasetId: string } }>;
  };

  return (data.datasets ?? []).map((d) => d.datasetReference.datasetId);
}

export async function listBigQueryTables(params: {
  tenantSlug: string;
  datasetId: string;
}): Promise<string[]> {
  const { tenantSlug, datasetId } = params;
  const sa = await loadServiceAccount(tenantSlug);
  const token = await getAccessToken(sa, BQ_SCOPE);
  const projectId = sa.project_id;

  const url = `${BQ_BASE}/projects/${projectId}/datasets/${datasetId}/tables`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`BigQuery list tables error ${res.status}: ${text}`);
  }

  const data = (await res.json()) as {
    tables?: Array<{ tableReference: { tableId: string } }>;
  };

  return (data.tables ?? []).map((t) => t.tableReference.tableId);
}
