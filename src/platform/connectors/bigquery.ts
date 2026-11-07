/**
 * BigQuery connector — query BigQuery tables using a service account.
 */

import { BigQuery } from '@google-cloud/bigquery';

export interface BigQueryConfig {
  projectId: string;
  serviceAccountJsonSecret: string;
}

export async function queryBigQuery(
  config: BigQueryConfig,
  sql: string,
  params: Record<string, unknown> = {},
  secretGetter: (name: string) => Promise<string>,
): Promise<{ columns: string[]; rows: Record<string, unknown>[]; totalRows: number }> {
  const rawJson = await secretGetter(config.serviceAccountJsonSecret);
  const credentials = JSON.parse(rawJson) as Record<string, unknown>;

  const bq = new BigQuery({
    projectId: config.projectId,
    credentials,
  });

  const hasParams = Object.keys(params).length > 0;
  const queryOptions: Parameters<typeof bq.query>[0] = {
    query: sql,
    location: 'US',
  };

  if (hasParams) {
    queryOptions.params = params;
    queryOptions.parameterMode = 'NAMED';
  }

  const [rows] = await bq.query(queryOptions);

  if (rows.length === 0) {
    return { columns: [], rows: [], totalRows: 0 };
  }

  const columns = Object.keys(rows[0] as Record<string, unknown>);
  const normalizedRows = rows.map((row) => {
    const r = row as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const col of columns) {
      const val = r[col];
      // BigQuery returns special objects for certain types; convert to primitives
      if (val !== null && typeof val === 'object' && 'value' in (val as Record<string, unknown>)) {
        out[col] = (val as { value: unknown }).value;
      } else {
        out[col] = val;
      }
    }
    return out;
  });

  return { columns, rows: normalizedRows, totalRows: normalizedRows.length };
}
