import { createHmac, scrypt, randomBytes, timingSafeEqual } from 'crypto'
import { promisify } from 'util'
import { pgPool } from '@/lib/db/client'
import type { PortalUser } from './types'

const scryptAsync = promisify(scrypt)

const JWT_SECRET = process.env.NEXTAUTH_SECRET ?? 'dev-portal-secret'
const TOKEN_EXPIRY_SECONDS = 60 * 60 * 24 * 7 // 7 days

export class AuthError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message)
    this.name = 'AuthError'
  }
}

// ─── Password hashing ─────────────────────────────────────────────────────────

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex')
  const derivedKey = await scryptAsync(password, salt, 64) as Buffer
  return `${salt}:${(derivedKey as Buffer).toString('hex')}`
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  const [salt, stored] = hash.split(':')
  if (!salt || !stored) return false
  try {
    const derivedKey = await scryptAsync(password, salt, 64) as Buffer
    const storedBuffer = Buffer.from(stored, 'hex')
    if (derivedKey.length !== storedBuffer.length) return false
    return timingSafeEqual(derivedKey, storedBuffer)
  } catch {
    return false
  }
}

// ─── Minimal JWT (no external deps) ─────────────────────────────────────────

function base64urlEncode(str: string): string {
  return Buffer.from(str).toString('base64url')
}

function base64urlDecode(str: string): string {
  return Buffer.from(str, 'base64url').toString('utf8')
}

function hmacSha256(data: string, secret: string): string {
  return createHmac('sha256', secret).update(data).digest('hex')
}

export interface PortalTokenPayload {
  userId: string
  portalId: string
  tenantSlug: string
  exp: number
}

export function signPortalToken(payload: Omit<PortalTokenPayload, 'exp'>): string {
  const full: PortalTokenPayload = {
    ...payload,
    exp: Math.floor(Date.now() / 1000) + TOKEN_EXPIRY_SECONDS,
  }
  const header = base64urlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const body = base64urlEncode(JSON.stringify(full))
  const sig = hmacSha256(`${header}.${body}`, JWT_SECRET)
  return `${header}.${body}.${base64urlEncode(sig)}`
}

export function verifyPortalToken(token: string): PortalTokenPayload | null {
  if (!token) return null
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null
    const [header, body, sig] = parts
    const expectedSig = hmacSha256(`${header}.${body}`, JWT_SECRET)
    const sigDecoded = base64urlDecode(sig)
    if (sigDecoded !== expectedSig) return null
    const payload = JSON.parse(base64urlDecode(body)) as PortalTokenPayload
    if (payload.exp < Math.floor(Date.now() / 1000)) return null
    return payload
  } catch {
    return null
  }
}

// ─── Portal user CRUD ─────────────────────────────────────────────────────────

export async function createPortalUser(params: {
  tenantSlug: string
  portalId: string
  email: string
  name: string
  password: string
  metadata?: Record<string, unknown>
}): Promise<PortalUser> {
  const passwordHash = await hashPassword(params.password)

  const result = await pgPool.query<{
    id: string
    portal_id: string
    tenant_slug: string
    email: string
    name: string
    password_hash: string
    metadata: Record<string, unknown>
    is_active: boolean
    created_at: string
    last_login_at: string | null
  }>(
    `INSERT INTO platform.portal_users
       (portal_id, tenant_slug, email, name, password_hash, metadata)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [
      params.portalId,
      params.tenantSlug,
      params.email.toLowerCase().trim(),
      params.name,
      passwordHash,
      JSON.stringify(params.metadata ?? {}),
    ]
  )

  if (result.rows.length === 0) {
    throw new AuthError('Failed to create portal user', 'CREATE_FAILED')
  }

  return rowToPortalUser(result.rows[0])
}

export async function portalLogin(params: {
  tenantSlug: string
  portalSlug: string
  email: string
  password: string
}): Promise<{ token: string; user: PortalUser }> {
  // Find portal
  const portalResult = await pgPool.query<{ id: string }>(
    `SELECT id FROM platform.portals
     WHERE tenant_slug = $1 AND slug = $2
     LIMIT 1`,
    [params.tenantSlug, params.portalSlug]
  )

  if (portalResult.rows.length === 0) {
    throw new AuthError('Portal not found', 'PORTAL_NOT_FOUND')
  }

  const portalId = portalResult.rows[0].id

  // Find user
  const userResult = await pgPool.query<{
    id: string
    portal_id: string
    tenant_slug: string
    email: string
    name: string
    password_hash: string
    metadata: Record<string, unknown>
    is_active: boolean
    created_at: string
    last_login_at: string | null
  }>(
    `SELECT * FROM platform.portal_users
     WHERE portal_id = $1 AND email = $2 AND is_active = true
     LIMIT 1`,
    [portalId, params.email.toLowerCase().trim()]
  )

  if (userResult.rows.length === 0) {
    throw new AuthError('Invalid email or password', 'INVALID_CREDENTIALS')
  }

  const userRow = userResult.rows[0]
  const valid = await verifyPassword(params.password, userRow.password_hash)

  if (!valid) {
    throw new AuthError('Invalid email or password', 'INVALID_CREDENTIALS')
  }

  // Update last login
  await pgPool.query(
    `UPDATE platform.portal_users SET last_login_at = now() WHERE id = $1`,
    [userRow.id]
  )

  const user = rowToPortalUser(userRow)
  const token = signPortalToken({
    userId: user.id,
    portalId: user.portalId,
    tenantSlug: user.tenantSlug,
  })

  return { token, user }
}

function rowToPortalUser(row: {
  id: string
  portal_id: string
  tenant_slug: string
  email: string
  name: string
  password_hash: string
  metadata: Record<string, unknown>
  is_active: boolean
  created_at: string
  last_login_at: string | null
}): PortalUser {
  return {
    id: row.id,
    portalId: row.portal_id,
    tenantSlug: row.tenant_slug,
    email: row.email,
    name: row.name,
    passwordHash: row.password_hash,
    metadata: row.metadata ?? {},
    isActive: row.is_active,
    createdAt: row.created_at,
    lastLoginAt: row.last_login_at ?? undefined,
  }
}
