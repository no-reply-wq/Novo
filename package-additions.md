# Additional packages to install

Run these after the initial setup:

```bash
npm install pg @types/pg
npm install jsonwebtoken @types/jsonwebtoken
npm install @auth/prisma-adapter
```

# Prisma setup

```bash
npx prisma generate
npx prisma db push
```

# Create initial platform admin

```ts
// scripts/create-admin.ts
import { prisma } from '../src/lib/db/client';
import { hashPassword } from '../src/lib/auth/password';

async function main() {
  const hash = await hashPassword('change-me-immediately');
  await prisma.platformAdmin.create({
    data: {
      name: 'LRBC Admin',
      email: 'admin@lrbc.com',
      passwordHash: hash,
    },
  });
  console.log('Platform admin created.');
}
main();
```

# Environment setup

1. Copy `.env.example` to `.env.local`
2. Fill in `DATABASE_URL` with your Postgres connection string
3. Generate `NEXTAUTH_SECRET`: `openssl rand -base64 32`
4. Run `npx prisma db push` to create the global schema
5. Run the admin creation script above
6. Start the dev server: `npm run dev`

# Provisioning first client

POST /api/platform/tenants (authenticated as platform admin)
```json
{
  "name": "Jeevaka Industries",
  "slug": "jeevaka",
  "plan": "pro",
  "seatLimit": 10,
  "adminEmail": "admin@jeevaka.com",
  "adminName": "Jeevaka Admin",
  "adminPassword": "securepassword123"
}
```

This creates:
- A `tenant_jeevaka` Postgres schema
- All ERP tables with default data
- An admin user
- Full permissions for the admin role

Client can then log in at: jeevaka.lrbc-erp.com (or /jeevaka/... in dev)
