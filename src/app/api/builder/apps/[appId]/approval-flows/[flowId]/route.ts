import { NextRequest, NextResponse } from 'next/server';
import { Pool } from 'pg';
import {
  getApprovalFlow,
  updateApprovalFlow,
  deleteApprovalFlow,
} from '@/platform/workflows/approvals';
import type { ApprovalLevel, ApprovalFlowMode } from '@/platform/workflows/approvals';

function getPool(): Pool {
  return new Pool({ connectionString: process.env.DATABASE_URL });
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ appId: string; flowId: string }> },
) {
  const { flowId } = await params;
  const pool = getPool();
  try {
    const flow = await getApprovalFlow(pool, flowId);
    if (!flow) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ flow });
  } finally {
    await pool.end();
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ appId: string; flowId: string }> },
) {
  const { flowId } = await params;
  const body = (await req.json()) as {
    name: string;
    levels: ApprovalLevel[];
    parallelOrSequential: ApprovalFlowMode;
  };

  const pool = getPool();
  try {
    const flow = await updateApprovalFlow(
      pool,
      flowId,
      body.name,
      body.levels,
      body.parallelOrSequential ?? 'sequential',
    );
    if (!flow) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ flow });
  } finally {
    await pool.end();
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ appId: string; flowId: string }> },
) {
  const { flowId } = await params;
  const pool = getPool();
  try {
    await deleteApprovalFlow(pool, flowId);
    return NextResponse.json({ deleted: true });
  } finally {
    await pool.end();
  }
}
