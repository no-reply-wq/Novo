-- Agent W2: In-app notifications
CREATE TABLE IF NOT EXISTS platform.notifications (
  id TEXT PRIMARY KEY,
  tenant_slug TEXT NOT NULL,
  recipient_user_id TEXT NOT NULL,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  link TEXT,
  app_id TEXT,
  record_id TEXT,
  read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notifications_recipient
  ON platform.notifications(tenant_slug, recipient_user_id, read, created_at DESC);
