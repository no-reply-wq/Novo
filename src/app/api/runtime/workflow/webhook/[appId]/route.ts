<<<<<<< HEAD
/**
 * POST /api/runtime/workflow/webhook/[appId]?path=...&tenant=...
 *
 * Receives incoming webhooks and dispatches matching workflows via pg-boss.
 * Optionally verifies HMAC-SHA256 signature (X-Webhook-Signature header).
 */

import { NextRequest, NextResponse } from "next/server";
import { createHmac } from "crypto";
import { tenantQuery } from "@/lib/db/client";
import { enqueueWorkflow } from "@/platform/workflow/queue";

function verifyHmac(payload: string, signature: string, secret: string): boolean {
  const expected = `sha256=${createHmac("sha256", secret).update(payload).digest("hex")}`;
  if (signature.length !== expected.length) return false;
  let mismatch = 0;
  for (let i = 0; i < expected.length; i++) {
    mismatch |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  }
  return mismatch === 0;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ appId: string }> },
): Promise<NextResponse> {
  const { appId } = await params;
  const url = new URL(req.url);
  const tenantSlug = url.searchParams.get("tenant");
  const webhookPath = url.searchParams.get("path") ?? "/";

  if (!tenantSlug) return NextResponse.json({ error: "Missing tenant" }, { status: 400 });

  const bodyText = await req.text();

  const webhookSecret =
    process.env[`WEBHOOK_SECRET_${appId.toUpperCase().replace(/-/g, "_")}`] ??
    process.env.WEBHOOK_SECRET;

  if (webhookSecret) {
    const signature = req.headers.get("x-webhook-signature") ?? "";
    if (!verifyHmac(bodyText, signature, webhookSecret)) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }
  }

  let payload: Record<string, unknown> = {};
  try {
    payload = bodyText ? (JSON.parse(bodyText) as Record<string, unknown>) : {};
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  let matchedWorkflows: { id: string }[] = [];
  try {
    const result = await tenantQuery<{ id: string }>(
      tenantSlug,
      `SELECT id FROM workflows
       WHERE app_id = $1
         AND enabled = true
         AND (trigger->>"type" = "webhook" OR trigger->>"event" = "webhook_incoming")
         AND trigger->>"webhookPath" = $2`,
      [appId, webhookPath],
    );
    matchedWorkflows = result.rows;
  } catch (err) {
    console.error("[webhook] DB query failed:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }

  if (matchedWorkflows.length === 0) {
    return NextResponse.json({ received: true, matched: 0 });
  }

  const enqueued: string[] = [];
  for (const wf of matchedWorkflows) {
    try {
      await enqueueWorkflow(wf.id, { _trigger: "webhook", path: webhookPath, ...payload }, tenantSlug);
      enqueued.push(wf.id);
    } catch (err) {
      console.error(`[webhook] Failed to enqueue workflow ${wf.id}:`, err);
    }
  }

=======
import { NextRequest, NextResponse } from 'next/server';
import { createHmac } from 'crypto';
import { tenantQuery } from '@/lib/db/client';
import { enqueueWorkflow } from '@/platform/workflow/queue';

function verifyHmac(payload: string, sig: string, secret: string): boolean {
  const expected = `sha256=${createHmac('sha256', secret).update(payload).digest('hex')}`;
  if (sig.length !== expected.length) return false;
  let m = 0;
  for (let i = 0; i < expected.length; i++) m |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
  return m === 0;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ appId: string }> }): Promise<NextResponse> {
  const { appId } = await params;
  const url = new URL(req.url);
  const tenantSlug = url.searchParams.get('tenant');
  const webhookPath = url.searchParams.get('path') ?? '/';
  if (!tenantSlug) return NextResponse.json({ error: 'Missing tenant' }, { status: 400 });
  const bodyText = await req.text();
  const secret = process.env[`WEBHOOK_SECRET_${appId.toUpperCase().replace(/-/g, '_')}`] ?? process.env.WEBHOOK_SECRET;
  if (secret) {
    const sig = req.headers.get('x-webhook-signature') ?? '';
    if (!verifyHmac(bodyText, sig, secret)) return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }
  let payload: Record<string, unknown> = {};
  try { payload = bodyText ? (JSON.parse(bodyText) as Record<string, unknown>) : {}; } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  let matchedWorkflows: { id: string }[] = [];
  try {
    const result = await tenantQuery<{ id: string }>(tenantSlug, "SELECT id FROM workflows WHERE app_id = $1 AND enabled = true AND (trigger->>'type' = 'webhook' OR trigger->>'event' = 'webhook_incoming') AND trigger->>'webhookPath' = $2", [appId, webhookPath]);
    matchedWorkflows = result.rows;
  } catch (err) { console.error('[webhook] DB error:', err); return NextResponse.json({ error: 'Internal error' }, { status: 500 }); }
  if (matchedWorkflows.length === 0) return NextResponse.json({ received: true, matched: 0 });
  const enqueued: string[] = [];
  for (const wf of matchedWorkflows) {
    try { await enqueueWorkflow(wf.id, { _trigger: 'webhook', path: webhookPath, ...payload }, tenantSlug); enqueued.push(wf.id); }
    catch (err) { console.error(`[webhook] enqueue ${wf.id} failed:`, err); }
  }
>>>>>>> 9e8f5e8 (feat(workflow): Agent F — Workflow Engine v2 complete)
  return NextResponse.json({ received: true, matched: matchedWorkflows.length, enqueued });
}
