import { Pool } from 'pg';

export interface DrilldownLevel {
  label: string;
  groupByField: string;
  sortBy?: string;
}

export interface DrilldownConfig {
  sourceMetric: string;
  sourceTableApiKey: string;
  aggregation: 'sum' | 'count' | 'avg';
  aggregationField?: string;
  groupByField: string;
  drilldownLevels: DrilldownLevel[];
}

export interface DrilldownResult {
  level: number;
  groupBy: string;
  rows: Array<{ label: string; value: number; hasChildren: boolean; filter: Record<string, unknown> }>;
}

function buildAggExpr(aggregation: 'sum' | 'count' | 'avg', field?: string): string {
  switch (aggregation) {
    case 'count': return 'COUNT(*)';
    case 'sum': if (!field) throw new Error('sum aggregation requires aggregationField'); return `SUM((data->>'${field}')::numeric)`;
    case 'avg': if (!field) throw new Error('avg aggregation requires aggregationField'); return `AVG((data->>'${field}')::numeric)`;
  }
}

function buildFilterClause(filters: Record<string, unknown>, startParam: number): { clause: string; values: unknown[] } {
  const clauses: string[] = [];
  const values: unknown[] = [];
  let i = startParam;
  for (const [key, val] of Object.entries(filters)) {
    clauses.push(`data->>'${key}' = $${i}`);
    values.push(String(val));
    i++;
  }
  return { clause: clauses.length ? `AND ${clauses.join(' AND ')}` : '', values };
}

export async function runDrilldown(config: DrilldownConfig, level: number, filters: Record<string, unknown>, appId: string, tenantSlug: string, pgPool: Pool): Promise<DrilldownResult> {
  let groupByField: string;
  let levelLabel: string;

  if (level === 0) {
    groupByField = config.groupByField;
    levelLabel = config.sourceMetric;
  } else {
    const drillLevel = config.drilldownLevels[level - 1];
    if (!drillLevel) throw new Error(`Drilldown level ${level} does not exist in config`);
    groupByField = drillLevel.groupByField;
    levelLabel = drillLevel.label;
  }

  const hasChildren = level < config.drilldownLevels.length;
  const aggExpr = buildAggExpr(config.aggregation, config.aggregationField);
  const { clause: filterClause, values: filterValues } = buildFilterClause(filters, 3);
  const tableName = `app_${appId.replace(/-/g, '_')}.${config.sourceTableApiKey}`;

  const sql = `
    SELECT data->>'${groupByField}' AS label, ${aggExpr} AS value
    FROM ${tableName}
    WHERE tenant_slug = $1 AND app_id = $2 ${filterClause}
    GROUP BY data->>'${groupByField}'
    ORDER BY value DESC NULLS LAST
  `;

  const values = [tenantSlug, appId, ...filterValues];
  const res = await pgPool.query<{ label: string; value: string }>(sql, values);
  const rows = res.rows.map((row) => ({
    label: row.label ?? '(unknown)',
    value: parseFloat(row.value ?? '0'),
    hasChildren,
    filter: { ...filters, [groupByField]: row.label },
  }));
  return { level, groupBy: levelLabel, rows };
}
