import { NextRequest, NextResponse } from 'next/server';
import { Pool } from 'pg';

function getPool(): Pool {
  return new Pool({ connectionString: process.env.DATABASE_URL });
}

// Minimal cron validation: 5 or 6 fields
function isValidCron(expr: string): boolean {
  const parts = expr.trim().split(/\s+/);
  return parts.length >= 5 && parts.length <= 6;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ appId: string; workflowId: string }> },
) {
  const { appId, workflowId } = await params;
  const pool = getPool();
  try {
    const result = await pool.query<Record<string, unknown>>(
      `SELECT * FROM platform.workflow_schedules
       WHERE app_id = $1 AND workflow_id = $2
       ORDER BY created_at`,
      [appId, workflowId],
    );
    return NextResponse.json({ schedules: result.rows });
  } finally {
    await pool.end();
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ appId: string; workflowId: string }> },
) {
  const { appId, workflowId } = await params;
  const body = (await req.json()) as {
    cronExpression: string;
    timezone?: string;
    isActive?: boolean;
  };

  if (!body.cronExpression) {
    return NextResponse.json({ error: 'cronExpression is required' }, { status: 400 });
  }

  if (!isValidCron(body.cronExpression)) {
    return NextResponse.json({ error: 'Invalid cron expression' }, { status: 400 });
  }

  const pool = getPool();
  try {
    const result = await pool.query<Record<string, unknown>>(
      `INSERT INTO platform.workflow_schedules
         (app_id, workflow_id, cron_expression, timezone, is_active)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [
        appId,
        workflowId,
        body.cronExpression,
        body.timezone ?? 'UTC',
        body.isActive ?? true,
      ],
    );
    return NextResponse.json({ schedule: result.rows[0] }, { status: 201 });
  } finally {
    await pool.end();
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ appId: string; workflowId: string }> },
) {
  const { appId, workflowId } = await params;
  const body = (await req.json()) as {
    scheduleId: string;
    cronExpression?: string;
    timezone?: string;
    isActive?: boolean;
  };

  if (!body.scheduleId) {
    return NextResponse.json({ error: 'scheduleId is required' }, { status: 400 });
  }

  if (body.cronExpression && !isValidCron(body.cronExpression)) {
    return NextResponse.json({ error: 'Invalid cron expression' }, { status: 400 });
  }

  const pool = getPool();
  try {
    const result = await pool.query<Record<string, unknown>>(
      `UPDATE platform.workflow_schedules
       SET
         cron_expression = COALESCE($3, cron_expression),
         timezone        = COALESCE($4, timezone),
         is_active       = COALESCE($5, is_active),
         updated_at      = now()
       WHERE id = $1 AND app_id = $2 AND workflow_id::text = $6
       RETURNING *`,
      [
        body.scheduleId,
        appId,
        body.cronExpression ?? null,
        body.timezone ?? null,
        body.isActive ?? null,
        workflowId,
      ],
    );
    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Schedule not found' }, { status: 404 });
    }
    return NextResponse.json({ schedule: result.rows[0] });
  } finally {
    await pool.end();
  }
}
