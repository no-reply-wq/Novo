/**
 * TOTP (Time-based One-Time Password) helper.
 *
 * Uses otplib v13 which is RFC 6238 compliant and compatible with
 * Google Authenticator, Authy and similar apps.
 *
 * Platform admins: TOTP is mandatory. The JWT carries `totpVerified: false`
 * after password login; the TOTP verify endpoint upgrades it to `true`.
 * Any route that requires a platform-admin session must reject
 * `totpVerified: false`.
 *
 * Tenant admins: TOTP is optional and tenant-enforced.
 */

import { generate, verify, generateSecret as _generateSecret, generateURI } from 'otplib';
import QRCode from 'qrcode';

const APP_NAME = process.env.TOTP_ISSUER ?? 'Novo ERP';

/** Generate a new TOTP secret for a user. */
export function generateTotpSecret(): string {
  return _generateSecret();
}

/**
 * Generate a provisioning URI (otpauth://) for QR code display.
 *
 * @param secret  The user's TOTP secret (from generateTotpSecret)
 * @param email   The user's email address (shown in the authenticator app)
 */
export async function totpProvisioningUri(secret: string, email: string): Promise<string> {
  return generateURI({ secret, label: email, issuer: APP_NAME });
}

/** Render a provisioning URI as a base64 PNG QR code (data: URI). */
export async function totpQrCodeDataUrl(secret: string, email: string): Promise<string> {
  const uri = await totpProvisioningUri(secret, email);
  return QRCode.toDataURL(uri);
}

/**
 * Verify a 6-digit TOTP code against the stored secret.
 * Accepts codes within a ±1 step window (30s each side) to tolerate clock skew.
 */
export async function verifyTotp(code: string, secret: string): Promise<boolean> {
  try {
    const result = await verify({ token: code, secret });
    return result.valid;
  } catch {
    // otplib throws TokenLengthError / TokenFormatError for malformed codes
    return false;
  }
}
