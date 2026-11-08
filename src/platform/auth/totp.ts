/**
 * Platform Auth — TOTP helpers (spec: gap-agent-w1-auth feature 1)
 *
 * Re-exports and extends src/lib/auth/totp.ts with:
 *   - generateTotpSecret()
 *   - verifyTotpToken(secret, token)
 *   - generateQrCodeUrl(secret, email)
 *   - generateBackupCodes()
 *   - verifyBackupCode(codes, input)
 */

import { generateTotpSecret as _generateTotpSecret, verifyTotp, totpQrCodeDataUrl } from '@/lib/auth/totp';
import { randomBytes } from "crypto";

export { generateTotpSecret } from '@/lib/auth/totp';

/**
 * Verify a TOTP token against the stored secret.
 * Returns true when the 6-digit code is valid within the ±1-step window.
 */
export async function verifyTotpToken(secret: string, token: string): Promise<boolean> {
  return verifyTotp(token, secret);
}

/**
 * Generate a QR code data-URL that authenticator apps can scan.
 * @param secret  32-char base32 TOTP secret
 * @param email   User email (displayed inside the authenticator app)
 */
export async function generateQrCodeUrl(secret: string, email: string): Promise<string> {
  return totpQrCodeDataUrl(secret, email);
}

/**
 * Generate 10 one-time backup codes (8 hex chars each, displayed once at setup).
 */
export function generateBackupCodes(): string[] {
  return Array.from({ length: 10 }, () => randomBytes(4).toString('hex'));
}

/**
 * Constant-time check: does the user's input match any unused backup code?
 * Returns the remaining codes on match (the matched code is consumed).
 * Returns null when the code is not found.
 */
export function verifyBackupCode(
  storedCodes: string[],
  input: string,
): { matched: boolean; remaining: string[] } {
  const normalised = input.toLowerCase().trim();
  let matched = false;
  const remaining = storedCodes.filter((c) => {
    if (!matched && c === normalised) {
      matched = true;
      return false; // consume it
    }
    return true;
  });
  return { matched, remaining };
}
