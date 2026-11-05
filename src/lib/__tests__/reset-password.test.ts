/**
 * Tests for src/lib/auth/reset-password.ts
 *
 * Uses jest.mock to avoid a real Postgres connection.
 *
 * Covers:
 * - Token is single-use (second redeem throws)
 * - Expired token is rejected
 * - Valid token updates password and bumps tokenVersion
 * - Short password is rejected
 * - Unknown token is rejected
 */

import crypto from 'crypto';

// ─── Mock prisma ────────────────────────────────────────────────────────────

const mockFindUnique = jest.fn();
const mockCreate = jest.fn();
const mockUpdate = jest.fn();
const mockDeleteMany = jest.fn();
const mockPlatformAdminFindUnique = jest.fn();
const mockPlatformAdminUpdate = jest.fn();
const mockTenantFindUnique = jest.fn();

jest.mock('../db/client', () => ({
  prisma: {
    passwordResetToken: {
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
      create: (...args: unknown[]) => mockCreate(...args),
      update: (...args: unknown[]) => mockUpdate(...args),
      deleteMany: (...args: unknown[]) => mockDeleteMany(...args),
    },
    platformAdmin: {
      findUnique: (...args: unknown[]) => mockPlatformAdminFindUnique(...args),
      update: (...args: unknown[]) => mockPlatformAdminUpdate(...args),
    },
    tenant: {
      findUnique: (...args: unknown[]) => mockTenantFindUnique(...args),
    },
  },
  tenantQuery: jest.fn().mockResolvedValue({ rows: [] }),
}));

// ─── Mock hashPassword ───────────────────────────────────────────────────────

jest.mock('../auth/password', () => ({
  hashPassword: jest.fn().mockResolvedValue('$2b$12$hashedpassword'),
}));

import { redeemPasswordResetToken, createPasswordResetToken } from '../auth/reset-password';

function sha256(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

const RAW_TOKEN = 'test-token-abc123';
const TOKEN_HASH = sha256(RAW_TOKEN);

function makeRecord(overrides: Partial<{
  usedAt: Date | null;
  expiresAt: Date;
  tenantSlug: string | null;
}> = {}) {
  return {
    id: 'rec-1',
    tokenHash: TOKEN_HASH,
    email: 'admin@example.com',
    tenantSlug: null,
    usedAt: null,
    expiresAt: new Date(Date.now() + 30 * 60 * 1000), // 30 min from now
    ...overrides,
  };
}

describe('redeemPasswordResetToken', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPlatformAdminUpdate.mockResolvedValue({});
    mockUpdate.mockResolvedValue({});
  });

  it('rejects an unknown token', async () => {
    mockFindUnique.mockResolvedValue(null);
    await expect(redeemPasswordResetToken('bad-token', 'NewPassword123!')).rejects.toThrow(
      'Invalid or expired reset link'
    );
  });

  it('rejects a token that has already been used', async () => {
    mockFindUnique.mockResolvedValue(makeRecord({ usedAt: new Date() }));
    await expect(redeemPasswordResetToken(RAW_TOKEN, 'NewPassword123!')).rejects.toThrow(
      'already been used'
    );
  });

  it('rejects a token that has expired', async () => {
    mockFindUnique.mockResolvedValue(
      makeRecord({ expiresAt: new Date(Date.now() - 1) }) // 1ms in the past
    );
    await expect(redeemPasswordResetToken(RAW_TOKEN, 'NewPassword123!')).rejects.toThrow(
      'expired'
    );
  });

  it('rejects a password shorter than 10 characters', async () => {
    // Short password check is before the DB lookup
    await expect(redeemPasswordResetToken(RAW_TOKEN, 'short')).rejects.toThrow(
      'at least 10 characters'
    );
  });

  it('marks token as used (single-use guarantee) on successful redeem', async () => {
    mockFindUnique.mockResolvedValue(makeRecord());
    mockPlatformAdminFindUnique.mockResolvedValue({ id: 'admin-1', email: 'admin@example.com', active: true });
    await redeemPasswordResetToken(RAW_TOKEN, 'NewPassword123!');
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ usedAt: expect.any(Date) }) })
    );
  });

  it('bumps tokenVersion on the platform admin (invalidates sessions)', async () => {
    mockFindUnique.mockResolvedValue(makeRecord());
    await redeemPasswordResetToken(RAW_TOKEN, 'NewPassword123!');
    expect(mockPlatformAdminUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ tokenVersion: { increment: 1 } }),
      })
    );
  });

  it('a second redeem of the same token fails (single-use)', async () => {
    // First call: token exists and not used
    mockFindUnique.mockResolvedValueOnce(makeRecord());
    await redeemPasswordResetToken(RAW_TOKEN, 'NewPassword123!');

    // Second call: token is now "used"
    mockFindUnique.mockResolvedValueOnce(makeRecord({ usedAt: new Date() }));
    await expect(redeemPasswordResetToken(RAW_TOKEN, 'NewPassword123!')).rejects.toThrow(
      'already been used'
    );
  });
});

describe('createPasswordResetToken', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreate.mockResolvedValue({});
    mockDeleteMany.mockResolvedValue({});
  });

  it('returns null for an unknown platform admin email', async () => {
    mockPlatformAdminFindUnique.mockResolvedValue(null);
    const result = await createPasswordResetToken({ email: 'nobody@example.com' });
    expect(result).toBeNull();
  });

  it('returns null for an inactive platform admin', async () => {
    mockPlatformAdminFindUnique.mockResolvedValue({ email: 'admin@example.com', active: false });
    const result = await createPasswordResetToken({ email: 'admin@example.com' });
    expect(result).toBeNull();
  });

  it('deletes prior unused tokens before creating a new one', async () => {
    mockPlatformAdminFindUnique.mockResolvedValue({ email: 'admin@example.com', active: true });
    await createPasswordResetToken({ email: 'admin@example.com' });
    expect(mockDeleteMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ email: 'admin@example.com' }) })
    );
    expect(mockCreate).toHaveBeenCalled();
  });

  it('returns a non-empty string token for a valid admin', async () => {
    mockPlatformAdminFindUnique.mockResolvedValue({ email: 'admin@example.com', active: true });
    const token = await createPasswordResetToken({ email: 'admin@example.com' });
    expect(typeof token).toBe('string');
    expect((token as string).length).toBeGreaterThan(20);
  });
});
