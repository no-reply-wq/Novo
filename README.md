# Novo — No-Code Builder Platform

A multi-tenant no-code platform for building business apps with Indian compliance built in.

## Features

- Visual app builder (drag-and-drop)
- Multi-tenant PostgreSQL (schema-per-tenant)
- Indian compliance: E-Invoice (IRP), E-Way Bill (NIC), GST R1, TDS, Bank Reconciliation
- Payments: Razorpay, Stripe
- Formula engine, workflow automation, role-based access control
- PDF generation (Gotenberg), Email, WhatsApp (Meta Cloud API)

## Quick Start (Docker)

```bash
cp .env.example .env
# Edit .env with your values — at minimum set NEXTAUTH_SECRET and PLATFORM_SECRET_KEY
docker-compose up -d
```

The app runs at <http://localhost:3000>.

The `app` service automatically runs database migrations before starting.

## Development

```bash
npm install
cp .env.example .env.local
# Edit .env.local — set DATABASE_URL and NEXTAUTH_SECRET at minimum
npx tsx src/scripts/migrate.ts   # run platform migrations
npm run dev
```

## Migrations

SQL migrations live in `migrations/platform/`, named numerically (e.g. `001_create_platform_tables.sql`).
They run in filename order and are tracked in `platform.migrations`.

```bash
# Apply all pending migrations
npm run migrate

# Check which migrations are applied
npm run migrate:status
```

## Health Check

```
GET /api/health
```

Returns `200 OK` with JSON when healthy, `503` when a critical check fails:

```json
{
  "status": "ok",
  "version": "0.1.0",
  "uptime": 42,
  "timestamp": "2024-01-01T00:00:00.000Z",
  "checks": {
    "database": { "status": "ok", "latencyMs": 2 },
    "migrations": { "status": "ok", "applied": 19, "expected": 19 },
    "memory": { "status": "ok", "heapUsedMb": 128, "heapTotalMb": 256 }
  }
}
```

## Architecture

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 15 App Router |
| Database | PostgreSQL 16 (schema-per-tenant) |
| ORM / Query | Prisma (control plane) + pg (tenant schemas) |
| Styling | Tailwind CSS |
| Auth | NextAuth.js |
| Job Queues | pg-boss |
| PDF | Gotenberg |
| Storage | Cloudflare R2 (S3-compatible) |

## Environment Variables

See [`.env.example`](.env.example) for the full list with descriptions.
