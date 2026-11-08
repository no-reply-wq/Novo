-- Migration: 010_2fa.sql
-- Adds TOTP columns to platform.users (tenant users) and
-- creates platform.user_sessions for session-policy enforcement.
-- Safe to run multiple times (IF NOT EXISTS / ON CONFLICT).

-- TOTP columns on tenant users
ALTER TABLE platform.users ADD COLUMN IF NOT EXISTS totp_secret TEXT;
ALTER TABLE platform.users ADD COLUMN IF NOT EXISTS totp_enabled BOOLEAN DEFAULT false;
ALTER TABLE platform.users ADD COLUMN IF NOT EXISTS totp_backup_codes TEXT[];

-- Session tracking table for concurrent-session and idle-timeout enforcement
CREATE TABLE IF NOT EXISTS platform.user_sessions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_token   TEXT NOT NULL UNIQUE,
  user_id         TEXT NOT NULL,
  tenant_slug     TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_active_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked         BOOLEAN NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS user_sessions_user_idx
  ON platform.user_sessions (user_id, tenant_slug)
  WHERE revoked = false;

-- Tenant settings store (session_policy JSON lives here)
CREATE TABLE IF NOT EXISTS platform.tenant_settings (
  tenant_slug TEXT NOT NULL,
  key         TEXT NOT NULL,
  value       JSONB NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_slug, key)
);
