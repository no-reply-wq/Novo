import { NextRequest, NextResponse } from 'next/server';
import { Pool } from 'pg';
import {
  listApprovalFlows,
  createApprovalFlow,
} from '@/platform/workflows/approvals';
import type { ApprovalLevel, ApprovalFlowMode } from '@/platform/workflows/approvals';

function getPool(): Pool {
  return new Pool({ connectionString: process.env.DATABASE_URL });
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ appId: string }> },
) {
  const { appId } = await params;
  const pool = getPool();
  try {
    const flows = await listApprovalFlows(pool, appId);
    return NextResponse.json({ flows });
  } finally {
    await pool.end();
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ appId: string }> },
) {
  const { appId } = await params;
  const body = (await req.json()) as {
    name: string;
    levels: ApprovalLevel[];
    parallelOrSequential: ApprovalFlowMode;
  };

  if (!body.name || !Array.isArray(body.levels) || body.levels.length === 0) {
    return NextResponse.json(
      { error: 'name and at least one level are required' },
      { status: 400 },
    );
  }

  const pool = getPool();
  try {
    const flow = await createApprovalFlow(
      pool,
      appId,
      body.name,
      body.levels,
      body.parallelOrSequential ?? 'sequential',
    );
    return NextResponse.json({ flow }, { status: 201 });
  } finally {
    await pool.end();
  }
}
