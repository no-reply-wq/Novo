# Novo — Multi-Tenant SaaS ERP Builder

A Next.js 16 App Router platform that lets teams build custom ERP applications with a drag-and-drop UI builder, table builder, workflow engine, and comprehensive ERP modules (CRM, Sales, Purchase, Inventory, Expenses, GST/E-Invoice, TDS).

## Architecture

- **Control plane** — `public` schema (PostgreSQL): `platform_admins`, `tenants`, `invitations`
- **Data plane** — one PostgreSQL schema per tenant (e.g. `tenant_acme`): all ERP + builder tables
- **Auth** — NextAuth with two credential providers: `platform-admin` and `tenant-user`
- **ORM** — Prisma for control-plane; raw `pg` Pool (`tenantQuery()`) for per-tenant schema queries
- **Storage** — Cloudflare R2 (falls back to local disk in dev)

## Prerequisites

- Node.js 20 required (see `.nvmrc` — run `nvm use`)
- PostgreSQL 15+
- npm / pnpm

## Setup

### 1. Clone & install

```bash
git clone <repo>
cd Novo-main
npm install
```

### 2. Environment variables

```bash
cp .env.example .env.local
# Edit .env.local with your values
```

Required variables:

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string (public schema) |
| `NEXTAUTH_SECRET` | Random secret ≥ 32 chars (`openssl rand -hex 32`) |
| `NEXTAUTH_URL` | Your app URL e.g. `http://localhost:3000` |
| `BASE_DOMAIN` | Root domain e.g. `localhost` |
| `NEXT_PUBLIC_BASE_URL` | Full URL e.g. `http://localhost:3000` |
| `STORAGE_ENDPOINT` | R2/S3 endpoint URL |
| `STORAGE_BUCKET` | Bucket name |
| `STORAGE_ACCESS_KEY` | R2/S3 access key |
| `STORAGE_SECRET_KEY` | R2/S3 secret key |
| `STORAGE_PUBLIC_URL` | Public URL for uploaded files |

Optional:
- `SENDGRID_API_KEY` / `EMAIL_FROM` — email notifications
- `VERCEL_TOKEN` / `VERCEL_TEAM_ID` — custom domain provisioning
- `PDF_TEMPLATE_BUCKET` — PDF generation

### 3. Run database migrations

```bash
# Apply all control-plane migrations (creates platform_admins, tenants, etc.)
npx prisma migrate deploy

# Or for first-time dev setup:
npx prisma db push

# Apply platform-schema migrations (migrations/platform/*.sql)
node scripts/run-platform-migrations.mjs
# On a database whose schema was already created by hand, record existing
# migrations as applied first (one time only):
#   node scripts/run-platform-migrations.mjs --baseline
```

### 4. Create first platform admin

```bash
npx tsx scripts/create-platform-admin.ts admin@example.com 'YourPassword123!' 'Admin Name'
# Or via API after starting the server:
# POST /api/platform/admins  { email, password, name }
```

### 5. Start development server

```bash
npm run dev
```

App runs at [http://localhost:3000](http://localhost:3000).

## First tenant

1. Sign in at `/platform/login` as platform admin
2. Go to Tenants → Create Tenant (slug e.g. `acme`)
3. Novo provisions a new PostgreSQL schema `tenant_acme` with all ERP tables
4. Sign in at `/login?tenant=acme` as the tenant user (default user is seeded)

## Tenant provisioning

When a tenant is created via `POST /api/platform/tenants`, the server:
1. Inserts a row in `public.tenants`
2. Creates `tenant_<slug>` schema in PostgreSQL
3. Runs `prisma/tenant-schema.sql` (with `:schema` → `tenant_<slug>`) to create all tables
4. Seeds an `admin` role with full permissions
5. Seeds a default admin user

## Running tests

```bash
# Start the dev server first
npm run dev &

# In another terminal:
node test-all-features.mjs
```

The test suite (50 tests) covers platform auth, tenant CRUD, all ERP data APIs, builder APIs, permission enforcement, and cleanup.

## Project structure

```
src/
  app/
    api/
      platform/      # Platform admin APIs (tenants, admins, staff)
      tenant/        # Tenant ERP APIs (CRM, sales, inventory, etc.)
      builder/       # App builder APIs (tables, fields, workflows, forms)
      runtime/       # Runtime APIs (e-invoice, TDS, files, PDF, workflows)
    (platform)/      # Platform admin UI
    (tenant)/        # Tenant ERP UI
  lib/
    auth/            # NextAuth config, session helpers, permission system
    db/              # Prisma client + raw pg pool + tenantQuery()
    ssrf.ts          # Safe fetch with private IP blocking
    storage.ts       # R2/S3 file storage
prisma/
  schema.prisma      # Control-plane schema
  tenant-schema.sql  # Tenant schema template (provisioned per tenant)
  migrations/        # Prisma migrations for control plane
```

## Security notes

- All tenant routes require `requireTenantSession()` + `requirePermission()`
- Schema names validated via `assertSchemaName()` before use in raw SQL
- Identifier injection prevented via `ident()` from `src/lib/sql.ts`
- SSRF protection via `safeFetch()` in `src/lib/ssrf.ts`
- Rate limiting on auth endpoints
- CSP headers + `X-Frame-Options: DENY` in `next.config.js`
- File uploads go to R2/S3 — never local disk in production
- `.env` files are gitignored; never commit secrets

## License

Private — all rights reserved.
