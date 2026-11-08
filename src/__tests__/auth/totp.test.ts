/**
 * Tests for src/platform/auth/totp.ts
 */

import {
  generateTotpSecret,
  verifyTotpToken,
  generateQrCodeUrl,
  generateBackupCodes,
  verifyBackupCode,
} from '@/platform/auth/totp';

// Use the same generate helper from otplib to produce valid tokens for testing
import { generate, NobleCryptoPlugin, ScureBase32Plugin } from 'otplib';

async function generateToken(secret: string): Promise<string> {
  return generate({ secret, crypto: new NobleCryptoPlugin() });
}

describe('TOTP — platform/auth/totp', () => {
  describe('generateTotpSecret()', () => {
    it('returns a non-empty string', () => {
      const secret = generateTotpSecret();
      expect(typeof secret).toBe('string');
      expect(secret.length).toBeGreaterThan(0);
    });

    it('generates unique secrets on each call', () => {
      const a = generateTotpSecret();
      const b = generateTotpSecret();
      expect(a).not.toBe(b);
    });
  });

  describe('verifyTotpToken(secret, token)', () => {
    it('accepts a correct TOTP token', async () => {
      const secret = generateTotpSecret();
      const token = await generateToken(secret);
      const valid = await verifyTotpToken(secret, token);
      expect(valid).toBe(true);
    });

    it('rejects a clearly wrong 6-digit token', async () => {
      const secret = generateTotpSecret();
      // Generate the real token; we'll test with a different fixed value
      const realToken = await generateToken(secret);
      // Flip last digit to get a wrong token
      const wrongToken = realToken.slice(0, -1) + ((parseInt(realToken.slice(-1)) + 1) % 10).toString();
      if (wrongToken !== realToken) {
        const valid = await verifyTotpToken(secret, wrongToken);
        expect(valid).toBe(false);
      }
    });

    it('rejects an empty string', async () => {
      const secret = generateTotpSecret();
      const valid = await verifyTotpToken(secret, '');
      expect(valid).toBe(false);
    });
  });

  describe('generateQrCodeUrl(secret, email)', () => {
    it('returns a data: URI containing a PNG QR code', async () => {
      const secret = generateTotpSecret();
      const url = await generateQrCodeUrl(secret, 'test@example.com');
      expect(url).toMatch(/^data:image\/png;base64,/);
      expect(url.length).toBeGreaterThan(100);
    });
  });

  describe('generateBackupCodes()', () => {
    it('generates 10 codes', () => {
      const codes = generateBackupCodes();
      expect(codes).toHaveLength(10);
    });

    it('each code is 8 hex chars', () => {
      const codes = generateBackupCodes();
      for (const code of codes) {
        expect(code).toMatch(/^[0-9a-f]{8}$/);
      }
    });

    it('generates unique sets', () => {
      const a = generateBackupCodes();
      const b = generateBackupCodes();
      expect(a).not.toEqual(b);
    });
  });

  describe('verifyBackupCode(storedCodes, input)', () => {
    it('matches a valid backup code and removes it', () => {
      const codes = ['abc12345', 'def67890', '12345678'];
      const result = verifyBackupCode(codes, 'def67890');
      expect(result.matched).toBe(true);
      expect(result.remaining).toEqual(['abc12345', '12345678']);
    });

    it('returns matched=false for an unknown code', () => {
      const codes = ['abc12345', 'def67890'];
      const result = verifyBackupCode(codes, 'xxxxxxxx');
      expect(result.matched).toBe(false);
      expect(result.remaining).toEqual(codes);
    });

    it('handles empty code list', () => {
      const result = verifyBackupCode([], 'abc12345');
      expect(result.matched).toBe(false);
      expect(result.remaining).toEqual([]);
    });

    it('trims and lowercases the input', () => {
      const codes = ['abc12345'];
      const result = verifyBackupCode(codes, '  ABC12345  ');
      expect(result.matched).toBe(true);
    });
  });
});
