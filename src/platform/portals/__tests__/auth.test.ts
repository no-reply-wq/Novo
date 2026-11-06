import {
  hashPassword,
  verifyPassword,
  signPortalToken,
  verifyPortalToken,
  AuthError,
} from '../auth'

// Mock pgPool so tests don't need a real DB
jest.mock('@/lib/db/client', () => ({
  pgPool: {
    query: jest.fn(),
  },
  prisma: {},
}))

import { pgPool } from '@/lib/db/client'

const mockQuery = pgPool.query as jest.MockedFunction<typeof pgPool.query>

describe('hashPassword / verifyPassword', () => {
  it('hashes password so hash !== plaintext', async () => {
    const hash = await hashPassword('secret123')
    expect(hash).not.toBe('secret123')
    expect(hash).toContain(':') // salt:key format
  })

  it('verifies correct password', async () => {
    const hash = await hashPassword('mypassword')
    const ok = await verifyPassword('mypassword', hash)
    expect(ok).toBe(true)
  })

  it('rejects wrong password', async () => {
    const hash = await hashPassword('mypassword')
    const ok = await verifyPassword('wrongpassword', hash)
    expect(ok).toBe(false)
  })

  it('produces different hashes for the same password (random salt)', async () => {
    const h1 = await hashPassword('same')
    const h2 = await hashPassword('same')
    expect(h1).not.toBe(h2)
  })
})

describe('signPortalToken / verifyPortalToken', () => {
  const payload = {
    userId: 'user-1',
    portalId: 'portal-1',
    tenantSlug: 'acme',
  }

  it('returns payload for valid token', () => {
    const token = signPortalToken(payload)
    const result = verifyPortalToken(token)
    expect(result).not.toBeNull()
    expect(result?.userId).toBe('user-1')
    expect(result?.portalId).toBe('portal-1')
    expect(result?.tenantSlug).toBe('acme')
  })

  it('returns null for invalid token', () => {
    const result = verifyPortalToken('totally.invalid.token')
    expect(result).toBeNull()
  })

  it('returns null for empty string', () => {
    expect(verifyPortalToken('')).toBeNull()
  })

  it('returns null for tampered token', () => {
    const token = signPortalToken(payload)
    const parts = token.split('.')
    // Tamper the body
    const tamperedBody = Buffer.from(JSON.stringify({ ...payload, userId: 'hacker' })).toString('base64url')
    const tampered = `${parts[0]}.${tamperedBody}.${parts[2]}`
    expect(verifyPortalToken(tampered)).toBeNull()
  })

  it('returns null for expired token', () => {
    // Create a token that expired in the past
    const expiredPayload = { ...payload, exp: Math.floor(Date.now() / 1000) - 1 }
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')
    const body = Buffer.from(JSON.stringify(expiredPayload)).toString('base64url')
    // We need a valid signature for the expired token
    // signPortalToken always adds exp in the future; create manually
    const { createHash } = jest.requireActual('crypto') as typeof import('crypto')
    const secret = process.env.NEXTAUTH_SECRET ?? 'dev-portal-secret'
    const sig = createHash('sha256').update(`${header}.${body}${secret}`).digest('hex')
    const sigEncoded = Buffer.from(sig).toString('base64url')
    const token = `${header}.${body}.${sigEncoded}`
    expect(verifyPortalToken(token)).toBeNull()
  })
})

describe('portalLogin', () => {
  beforeEach(() => {
    mockQuery.mockReset()
  })

  it('succeeds with correct password', async () => {
    const { portalLogin, createPortalUser: _cu } = await import('../auth')
    const hash = await hashPassword('password123')

    // Mock portal lookup
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 'portal-1' }], rowCount: 1 } as never)
      // Mock user lookup
      .mockResolvedValueOnce({
        rows: [{
          id: 'user-1',
          portal_id: 'portal-1',
          tenant_slug: 'acme',
          email: 'alice@example.com',
          name: 'Alice',
          password_hash: hash,
          metadata: {},
          is_active: true,
          created_at: '2024-01-01T00:00:00Z',
          last_login_at: null,
        }],
        rowCount: 1,
      } as never)
      // Mock last_login_at update
      .mockResolvedValueOnce({ rows: [], rowCount: 1 } as never)

    const result = await portalLogin({
      tenantSlug: 'acme',
      portalSlug: 'customer-portal',
      email: 'alice@example.com',
      password: 'password123',
    })

    expect(result.token).toBeTruthy()
    expect(result.user.email).toBe('alice@example.com')
  })

  it('fails with wrong password', async () => {
    const { portalLogin } = await import('../auth')
    const hash = await hashPassword('correct')

    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 'portal-1' }], rowCount: 1 } as never)
      .mockResolvedValueOnce({
        rows: [{
          id: 'user-1',
          portal_id: 'portal-1',
          tenant_slug: 'acme',
          email: 'alice@example.com',
          name: 'Alice',
          password_hash: hash,
          metadata: {},
          is_active: true,
          created_at: '2024-01-01T00:00:00Z',
          last_login_at: null,
        }],
        rowCount: 1,
      } as never)

    await expect(
      portalLogin({
        tenantSlug: 'acme',
        portalSlug: 'customer-portal',
        email: 'alice@example.com',
        password: 'wrongpassword',
      })
    ).rejects.toThrow(AuthError)
  })
})

describe('createPortalUser', () => {
  beforeEach(() => {
    mockQuery.mockReset()
  })

  it('hashes password (hash !== plaintext)', async () => {
    const { createPortalUser } = await import('../auth')

    let capturedHash = ''
    mockQuery.mockImplementation(async (_sql: unknown, params: unknown) => {
      capturedHash = (params as unknown[])[4] as string
      return {
        rows: [{
          id: 'user-new',
          portal_id: 'portal-1',
          tenant_slug: 'acme',
          email: 'bob@example.com',
          name: 'Bob',
          password_hash: capturedHash,
          metadata: {},
          is_active: true,
          created_at: '2024-01-01T00:00:00Z',
          last_login_at: null,
        }],
        rowCount: 1,
      }
    })

    await createPortalUser({
      tenantSlug: 'acme',
      portalId: 'portal-1',
      email: 'bob@example.com',
      name: 'Bob',
      password: 'plaintext',
    })

    expect(capturedHash).not.toBe('plaintext')
    expect(capturedHash).toContain(':')
  })
})
