/**
 * Integration test endpoint
 * POST /api/builder/integrations/[integrationId]/test
 *
 * Tests the connection for a configured integration.
 * Returns { ok: true } on success or { ok: false, error: string } on failure.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { pgPool } from '@/lib/db/client';
import { decryptSecret } from '@/platform/integrations/secrets';
import { NotConfiguredError } from '@/platform/integrations/secrets/manager';

interface DbRow {
  tenant_slug: string;
  type: string;
  config: Record<string, string>;
  enabled: boolean;
}

async function authorize(tenantSlug: string): Promise<NextResponse | null> {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!session.user.isPlatformAdmin && session.user.tenantSlug !== tenantSlug) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  return null;
}

type Params = { params: Promise<{ integrationId: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const { integrationId } = await params;
  const body = await req.json().catch(() => ({})) as { tenantSlug?: string };
  const tenantSlug = body.tenantSlug ?? '';

  if (!tenantSlug) {
    return NextResponse.json({ error: 'Missing tenantSlug in body' }, { status: 400 });
  }

  const authErr = await authorize(tenantSlug);
  if (authErr) return authErr;

  const result = await pgPool.query<DbRow>(
    `SELECT tenant_slug, type, config, enabled
     FROM platform.integration_configs
     WHERE id = $1 AND tenant_slug = $2`,
    [integrationId, tenantSlug]
  );

  if (result.rows.length === 0) {
    return NextResponse.json({ error: 'Integration not found' }, { status: 404 });
  }

  const { type, config, enabled } = result.rows[0];

  if (!enabled) {
    return NextResponse.json({ ok: false, error: 'Integration is disabled' });
  }

  try {
    switch (type) {
      case 'whatsapp_meta': {
        if (!config['phoneNumberId'] || !config['accessToken']) {
          throw new NotConfiguredError('Missing phoneNumberId or accessToken');
        }
        const token = decryptSecret(config['accessToken'], tenantSlug);
        const phoneId = config['phoneNumberId'];
        const res = await fetch(
          `https://graph.facebook.com/v18.0/${phoneId}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (!res.ok) {
          const text = await res.text().catch(() => '');
          throw new Error(`Meta API returned ${res.status}: ${text}`);
        }
        break;
      }

      case 'resend': {
        if (!config['apiKey']) {
          throw new NotConfiguredError('Missing apiKey');
        }
        const apiKey = decryptSecret(config['apiKey'], tenantSlug);
        const res = await fetch('https://api.resend.com/domains', {
          headers: { Authorization: `Bearer ${apiKey}` },
        });
        if (!res.ok) {
          const text = await res.text().catch(() => '');
          throw new Error(`Resend API returned ${res.status}: ${text}`);
        }
        break;
      }

      case 'smtp':
      case 'ses':
      case 's3':
      case 'r2':
      case 'rest':
      case 'postgres':
      case 'mysql': {
        // Minimal check: verify required keys are present and can be decrypted
        const requiredKeys = getRequiredKeys(type);
        for (const key of requiredKeys) {
          if (!config[key]) {
            throw new NotConfiguredError(`Missing required config key: ${key}`);
          }
          decryptSecret(config[key], tenantSlug); // throws if decrypt fails
        }
        break;
      }

      default:
        throw new Error(`Unknown integration type: ${type}`);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message });
  }
}

function getRequiredKeys(type: string): string[] {
  switch (type) {
    case 'smtp': return ['host', 'port'];
    case 'ses': return ['region', 'accessKeyId', 'secretAccessKey'];
    case 's3': return ['bucket', 'region', 'accessKeyId', 'secretAccessKey'];
    case 'r2': return ['bucket', 'accountId', 'accessKeyId', 'secretAccessKey'];
    case 'rest': return ['baseUrl'];
    case 'postgres': return ['connectionString'];
    case 'mysql': return ['connectionString'];
    default: return [];
  }
}
