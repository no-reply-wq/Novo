<<<<<<< HEAD
import dns from "dns/promises";
import type { StepDef, WorkflowContext, StepResult, WorkflowDeps } from "../types";

const PRIVATE_RANGES: RegExp[] = [
  /^127\./, /^10\./, /^172\.(1[6-9]|2\d|3[01])\./, /^192\.168\./, /^169\.254\./,
  /^::1$/, /^fc[0-9a-f]{2}:/i, /^fe80:/i, /^0\./, /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./,
];
const BLOCKED_HOSTNAMES = new Set(["localhost", "metadata.google.internal"]);

async function assertSsrfSafe(url: string): Promise<void> {
  const parsed = new URL(url);
  const hostname = parsed.hostname.toLowerCase();
  if (BLOCKED_HOSTNAMES.has(hostname)) throw new Error(`SSRF blocked: hostname "${hostname}"`);
  const result = await dns.lookup(hostname, { all: true });
  for (const r of result) {
    if (PRIVATE_RANGES.some((rx) => rx.test(r.address)))
      throw new Error(`SSRF blocked: IP ${r.address} is private`);
  }
}

export async function executeStep(step: StepDef, ctx: WorkflowContext, _deps: WorkflowDeps): Promise<StepResult> {
  const url = step.config["url"] as string;
  const method = ((step.config["method"] as string) ?? "GET").toUpperCase();
  const headers = (step.config["headers"] as Record<string, string>) ?? {};
  const body = step.config["body"];
  const outputVariable = (step.config["outputVariable"] as string) ?? "_apiResponse";
  if (!url) throw new Error("call_api: url is required");
  await assertSsrfSafe(url);
  const fetchBody = body != null ? JSON.stringify(body) : undefined;
  const response = await fetch(url, { method, headers: { "Content-Type": "application/json", ...headers }, body: fetchBody });
  const text = await response.text();
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { parsed = text; }
  ctx.variables[outputVariable] = parsed;
  return { output: { status: response.status, body: parsed }, logs: [`${method} ${url} → ${response.status}`] };
=======
import dns from 'dns/promises';
import type { StepDef, WorkflowContext, StepResult, WorkflowDeps } from '../types';
const PRIVATE_RANGES = [/^127\./, /^10\./, /^172\.(1[6-9]|2\d|3[01])\./, /^192\.168\./, /^169\.254\./, /^::1$/, /^fc[0-9a-f]{2}:/i, /^fe80:/i, /^0\./, /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./];
const BLOCKED_HOSTNAMES = new Set(['localhost', 'metadata.google.internal']);
async function assertSsrfSafe(url: string): Promise<void> {
  const { hostname } = new URL(url);
  if (BLOCKED_HOSTNAMES.has(hostname.toLowerCase())) throw new Error(`SSRF blocked: ${hostname}`);
  const addrs = await dns.lookup(hostname, { all: true });
  for (const r of addrs) { if (PRIVATE_RANGES.some((rx) => rx.test(r.address))) throw new Error(`SSRF blocked: ${r.address}`); }
}
export async function executeStep(step: StepDef, ctx: WorkflowContext, _deps: WorkflowDeps): Promise<StepResult> {
  const url = step.config['url'] as string;
  const method = ((step.config['method'] as string) ?? 'GET').toUpperCase();
  const headers = (step.config['headers'] as Record<string, string>) ?? {};
  const body = step.config['body'];
  const outputVariable = (step.config['outputVariable'] as string) ?? '_apiResponse';
  if (!url) throw new Error('call_api: url is required');
  await assertSsrfSafe(url);
  const response = await fetch(url, { method, headers: { 'Content-Type': 'application/json', ...headers }, body: body != null ? JSON.stringify(body) : undefined });
  const text = await response.text();
  let parsed: unknown; try { parsed = JSON.parse(text); } catch { parsed = text; }
  ctx.variables[outputVariable] = parsed;
  return { output: { status: response.status, body: parsed }, logs: [`${method} ${url} -> ${response.status}`] };
>>>>>>> 9e8f5e8 (feat(workflow): Agent F — Workflow Engine v2 complete)
}
