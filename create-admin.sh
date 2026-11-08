#!/bin/bash
# Creates platform admin user in Novo database
HASH='$2b$12$vFqqo0n4PIngITuPy0PcJO5Y6Dg8TSvgZ6WBvYbBoJMBMoR2V9WCq'

/opt/homebrew/opt/postgresql@16/bin/psql -d novo -c "
INSERT INTO platform.users (id, email, name, role, password_hash, created_at, updated_at)
VALUES (
  'usr_admin_001',
  'admin@novo.com',
  'Aniket Pattanayak',
  'platform_admin',
  '$HASH',
  now(),
  now()
)
ON CONFLICT (email) DO UPDATE SET
  password_hash = EXCLUDED.password_hash,
  name = EXCLUDED.name,
  role = EXCLUDED.role;
"
echo "Done!"
