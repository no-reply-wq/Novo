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

// ─── POST: link lines ─────────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = (await req.json()) as {
      configId?: string;
      sourceLineId?: string;
      targetLineId?: string;
      qty?: number;
      userId?: string;
      tenantSlug?: string;
      config?: FulfilmentConfig;
    };

    const { configId, sourceLineId, targetLineId, qty, userId, tenantSlug, config } = body;

    if (!configId || !sourceLineId || !targetLineId || qty === undefined || !userId || !tenantSlug || !config) {
      return NextResponse.json(
        { error: 'configId, sourceLineId, targetLineId, qty, userId, tenantSlug, and config are required' },
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
  try {
    const { searchParams } = new URL(req.url);
    const configId = searchParams.get('configId');
    const sourceLineId = searchParams.get('sourceLineId');
    const tenantSlug = searchParams.get('tenantSlug');

    if (!configId || !sourceLineId || !tenantSlug) {
      return NextResponse.json(
        { error: 'configId, sourceLineId, and tenantSlug are required query params' },
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
