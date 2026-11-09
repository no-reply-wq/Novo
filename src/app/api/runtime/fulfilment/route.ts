/**
 * Runtime fulfilment API.
 *
 * POST /api/runtime/fulfilment/link   — link source line to target line
 * GET  /api/runtime/fulfilment/summary — get summary for a source line
 */

import { NextRequest, NextResponse } from 'next/server';
import { pgPool } from '@/lib/db/client';
import { linkLines, getFulfilmentSummary } from '@/platform/engines/fulfilment/engine';
import type { FulfilmentConfig } from '@/platform/engines/fulfilment/types';
import { requireSessionTenant } from '@/lib/auth/tenant-session';

// ─── POST: link lines ─────────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ctx = await requireSessionTenant();
  if (ctx instanceof NextResponse) return ctx;
  try {
    const body = (await req.json()) as {
      configId?: string;
      sourceLineId?: string;
      targetLineId?: string;
      qty?: number;
      config?: FulfilmentConfig;
    };

    const { configId, sourceLineId, targetLineId, qty, config } = body;
    const userId = ctx.userId;
    const tenantSlug = ctx.tenant.slug;

    if (!configId || !sourceLineId || !targetLineId || qty === undefined || !config) {
      return NextResponse.json(
        { error: 'configId, sourceLineId, targetLineId, qty, and config are required' },
        { status: 400 },
      );
    }

    const link = await linkLines(configId, sourceLineId, targetLineId, qty, userId, tenantSlug, pgPool, config);
    return NextResponse.json(link, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('Over-fulfilment')) {
      return NextResponse.json({ error: message }, { status: 422 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ─── GET: summary ─────────────────────────────────────────────────────────────

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = await requireSessionTenant();
  if (ctx instanceof NextResponse) return ctx;
  try {
    const { searchParams } = new URL(req.url);
    const configId = searchParams.get('configId');
    const sourceLineId = searchParams.get('sourceLineId');
    const tenantSlug = ctx.tenant.slug;

    if (!configId || !sourceLineId) {
      return NextResponse.json(
        { error: 'configId and sourceLineId are required query params' },
        { status: 400 },
      );
    }

    // Load config from platform DB
    const configRes = await pgPool.query<{ config: FulfilmentConfig }>(
      `SELECT config FROM platform.fulfilment_configs WHERE id = $1`,
      [configId],
    );
    if (!configRes.rows.length) {
      return NextResponse.json({ error: 'Config not found' }, { status: 404 });
    }

    const config = configRes.rows[0].config;
    const summary = await getFulfilmentSummary(configId, sourceLineId, pgPool, config, tenantSlug);
    return NextResponse.json(summary);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
