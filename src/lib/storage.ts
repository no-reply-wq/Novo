/**
 * File storage abstraction — Cloudflare R2 (or S3-compatible) private bucket.
 *
 * Files are stored privately. Access is always via short-lived signed URLs.
 *
 * Required env vars:
 *   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME
 *   R2_PUBLIC_URL_BASE (optional — only needed if the bucket has public access, which we don't use)
 *
 * Falls back to local disk when R2 env vars are absent (dev only).
 */

import crypto from 'crypto';
import { writeFile, mkdir, readFile } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';

// ─── Magic-byte signatures for blocked / dangerous types ─────────────────────

/** Returns true when the buffer looks like an SVG (XML starting with <svg). */
function looksLikeSvg(buf: Buffer): boolean {
  const head = buf.subarray(0, 1024).toString('utf8').replace(/\s+/g, '').toLowerCase();
  return head.includes('<svg') || head.startsWith('<?xml');
}

/** Returns true when the buffer looks like HTML. */
function looksLikeHtml(buf: Buffer): boolean {
  const head = buf.subarray(0, 256).toString('utf8').replace(/\s+/g, '').toLowerCase();
  return head.startsWith('<!doctype') || head.startsWith('<html');
}

// ─── MIME-type allow-list ─────────────────────────────────────────────────────

/** MIME types that are explicitly blocked (regardless of allow-list). */
const BLOCKED_TYPES = new Set([
  'image/svg+xml',
  'text/html',
  'application/xhtml+xml',
  'text/xml',
  'application/xml',
]);

/** Validate a file's MIME type AND magic bytes. Throws on rejection. */
export function validateFileType(mimeType: string, buf: Buffer, filename: string): void {
  if (BLOCKED_TYPES.has(mimeType)) {
    throw new Error(`File type "${mimeType}" is not allowed (${filename})`);
  }
  if (looksLikeSvg(buf)) {
    throw new Error(`SVG content detected in file "${filename}" — blocked for security`);
  }
  if (looksLikeHtml(buf)) {
    throw new Error(`HTML content detected in file "${filename}" — blocked for security`);
  }
}

// ─── AWS Signature v4 helpers ────────────────────────────────────────────────

function hmacSha256(key: Buffer | string, data: string): Buffer {
  return crypto.createHmac('sha256', key).update(data, 'utf8').digest();
}
function sha256hex(data: string | Buffer): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

function getSigningKey(secretKey: string, dateStamp: string, region: string, service: string): Buffer {
  const kDate = hmacSha256('AWS4' + secretKey, dateStamp);
  const kRegion = hmacSha256(kDate, region);
  const kService = hmacSha256(kRegion, service);
  return hmacSha256(kService, 'aws4_request');
}

interface PresignOptions {
  bucket: string;
  region: string;
  endpoint: string; // e.g. https://<account>.r2.cloudflarestorage.com
  accessKeyId: string;
  secretAccessKey: string;
  key: string;
  method: 'GET' | 'PUT';
  expiresIn: number; // seconds
  contentType?: string;
}

/** Generate a pre-signed URL using AWS Signature v4. Compatible with R2 and S3. */
export function presignUrl(opts: PresignOptions): string {
  const now = new Date();
  const dateStamp = now.toISOString().slice(0, 10).replace(/-/g, ''); // YYYYMMDD
  const amzDate = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, ''); // YYYYMMDDTHHmmssZ

  const service = 's3';
  const credentialScope = `${dateStamp}/${opts.region}/${service}/aws4_request`;
  const credential = `${opts.accessKeyId}/${credentialScope}`;

  const url = new URL(`${opts.endpoint}/${opts.bucket}/${opts.key}`);
  url.searchParams.set('X-Amz-Algorithm', 'AWS4-HMAC-SHA256');
  url.searchParams.set('X-Amz-Credential', credential);
  url.searchParams.set('X-Amz-Date', amzDate);
  url.searchParams.set('X-Amz-Expires', String(opts.expiresIn));
  url.searchParams.set('X-Amz-SignedHeaders', 'host');

  if (opts.contentType) {
    url.searchParams.set('Content-Type', opts.contentType);
  }

  const canonicalQueryString = Array.from(url.searchParams.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');

  const canonicalRequest = [
    opts.method,
    `/${opts.bucket}/${opts.key}`,
    canonicalQueryString,
    `host:${url.hostname}\n`,
    'host',
    'UNSIGNED-PAYLOAD',
  ].join('\n');

  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    sha256hex(canonicalRequest),
  ].join('\n');

  const signingKey = getSigningKey(opts.secretAccessKey, dateStamp, opts.region, service);
  const signature = hmacSha256(signingKey, stringToSign).toString('hex');

  url.searchParams.set('X-Amz-Signature', signature);

  return url.toString();
}

// ─── Storage backend ─────────────────────────────────────────────────────────

function r2Config() {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_BUCKET_NAME;
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) return null;
  return {
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    region: 'auto',
    accessKeyId,
    secretAccessKey,
    bucket,
  };
}

/** Upload a file buffer and return the storage key (never a public URL). */
export async function uploadFile(
  key: string,
  buf: Buffer,
  mimeType: string,
): Promise<string> {
  const r2 = r2Config();
  if (r2) {
    // Upload to R2 using a presigned PUT URL
    const putUrl = presignUrl({
      ...r2,
      key,
      method: 'PUT',
      expiresIn: 60,
      contentType: mimeType,
    });
    const res = await fetch(putUrl, {
      method: 'PUT',
      headers: { 'Content-Type': mimeType },
      body: new Blob([new Uint8Array(buf)]),
    });
    if (!res.ok) {
      throw new Error(`R2 upload failed: ${res.status} ${res.statusText}`);
    }
    return key;
  }

  // Dev fallback: local disk under /tmp/novo-uploads
  const absDir = path.join('/tmp/novo-uploads', path.dirname(key));
  if (!existsSync(absDir)) await mkdir(absDir, { recursive: true });
  await writeFile(path.join('/tmp/novo-uploads', key), buf);
  return key;
}

/** Return a short-lived (default 15 min) signed URL for a stored file. */
export async function getSignedUrl(key: string, expiresInSeconds = 900): Promise<string> {
  const r2 = r2Config();
  if (r2) {
    return presignUrl({
      ...r2,
      key,
      method: 'GET',
      expiresIn: expiresInSeconds,
    });
  }

  // Dev fallback: return a /api route that streams from local disk
  return `/api/dev-files/${encodeURIComponent(key)}`;
}

/** Dev-only: stream a locally stored file (only registered in development). */
export async function readLocalFile(key: string): Promise<Buffer> {
  return readFile(path.join('/tmp/novo-uploads', key));
}
