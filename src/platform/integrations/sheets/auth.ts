/**
 * Google OAuth2 JWT flow for service accounts.
 * Uses Node's built-in crypto — no googleapis SDK.
 */

import crypto from 'crypto';
import { ServiceAccountJson } from './types';

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const TOKEN_TTL_SECONDS = 3600;

/** Build and sign a JWT for the Google API JWT Bearer flow. */
function buildJwt(sa: ServiceAccountJson, scope: string): string {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(
    JSON.stringify({ alg: 'RS256', typ: 'JWT', kid: sa.private_key_id })
  ).toString('base64url');

  const payload = Buffer.from(
    JSON.stringify({
      iss: sa.client_email,
      scope,
      aud: GOOGLE_TOKEN_URL,
      iat: now,
      exp: now + TOKEN_TTL_SECONDS,
    })
  ).toString('base64url');

  const signingInput = `${header}.${payload}`;
  const sign = crypto.createSign('RSA-SHA256');
  sign.update(signingInput);
  const signature = sign.sign(sa.private_key, 'base64url');

  return `${signingInput}.${signature}`;
}

/** Exchange a signed JWT for a Google access token. */
export async function getAccessToken(
  sa: ServiceAccountJson,
  scope: string
): Promise<string> {
  const jwt = buildJwt(sa, scope);
  const body = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion: jwt,
  });

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to obtain Google access token: ${response.status} ${text}`);
  }

  const data = (await response.json()) as { access_token: string };
  if (!data.access_token) {
    throw new Error('Google token response missing access_token');
  }
  return data.access_token;
}
