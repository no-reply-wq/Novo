/**
 * Builder API: tenant secrets management.
 * Values are write-only — the GET endpoint returns only key names, never values.
 */

import { NextRequest, NextResponse } from 'next/server';
import { encryptSecret } from '@/platform/scripts/secrets';

type Params = Promise<{ appId: string }>;

// In-memory store for now; replace with Postgres (platform.tenant_secrets) in prod.
// Maps appId -> Map<key, ciphertext>
const secretStore = new Map<string, Map<string, string>>();

function getAppSecrets(appId: string): Map<string, string> {
  let m = secretStore.get(appId);
  if (!m) {
    m = new Map();
    secretStore.set(appId, m);
  }
  return m;
}

/** List secret keys (never values). */
export async function GET(
  _req: NextRequest,
  { params }: { params: Params },
) {
  const { appId } = await params;
  const keys = Array.from(getAppSecrets(appId).keys());
  return NextResponse.json({ keys });
}

/** Create or overwrite a secret. Value is immediately encrypted; never stored in plain text. */
export async function POST(
  req: NextRequest,
  { params }: { params: Params },
) {
  const { appId } = await params;
  const body = (await req.json()) as { key?: string; value?: string; tenantSlug?: string };

  if (!body.key || typeof body.key !== 'string') {
    return NextResponse.json({ error: 'key is required' }, { status: 400 });
  }
  if (!body.value || typeof body.value !== 'string') {
    return NextResponse.json({ error: 'value is required' }, { status: 400 });
  }
  if (!body.tenantSlug || typeof body.tenantSlug !== 'string') {
    return NextResponse.json({ error: 'tenantSlug is required' }, { status: 400 });
  }

  const ciphertext = await encryptSecret(body.value, body.tenantSlug);
  getAppSecrets(appId).set(body.key, ciphertext);

  return NextResponse.json({ ok: true, key: body.key }, { status: 201 });
}

/** Delete a secret. */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Params },
) {
  const { appId } = await params;
  const { searchParams } = new URL(req.url);
  const key = searchParams.get('key');
  if (!key) {
    return NextResponse.json({ error: 'key query param is required' }, { status: 400 });
  }
  getAppSecrets(appId).delete(key);
  return NextResponse.json({ ok: true });
}
