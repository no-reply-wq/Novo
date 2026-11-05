# Novo Platform — Architecture

> **One-page reference for all Wave 1 sub-agents.**
> Read this before writing a single line of code for your module.

---

## 0. What we are building

Novo is a **no-code application builder** hosted on a multi-tenant Next.js 16 / Postgres stack.

A tenant admin configures tables, fields, formulas, access rules, workflows, and pages
through a UI. No code change is needed to ship a new business app. The Wave 1 goal is
to prove this end-to-end with a "Purchase Order" app that any admin can build without
touching source code.

---

## 1. Layer diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│  Browser (Next.js App Router)                                        │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │  Design System  (Agent D)                                      │  │
│  │  src/components/ui/   src/styles/                              │  │
│  │  ~40 components, theme tokens, /dev/ui catalogue page          │  │
│  └────────────────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────┐  ┌─────────────────────────────────┐  │
│  │  Page Builder runtime    │  │  Workflow runner (browser)       │  │
│  │  Bindings · QueryDef     │  │  ActionDef · TriggerDef          │  │
│  └──────────────────────────┘  └─────────────────────────────────┘  │
└───────────────────────────────┬─────────────────────────────────────┘
                                │  Next.js API Routes / RSC
┌───────────────────────────────▼─────────────────────────────────────┐
│  Platform API (Next.js App Router — /app/api/platform/)              │
│  ┌────────────────────┐  ┌────────────────────┐  ┌───────────────┐  │
│  │  Data layer        │  │  Access layer       │  │  Integrations │  │
│  │  (Agent A)         │  │  (Agent C)          │  │  (Agent E)    │  │
│  │  src/platform/data │  │  src/platform/access│  │  src/platform/│  │
│  │  migrations/       │  │  Postgres RLS       │  │  integrations/│  │
│  └────────────────────┘  └────────────────────┘  └───────────────┘  │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │  Expression engine  (Agent B)                                   │  │
│  │  src/platform/expr/                                             │  │
│  │  parse · typeCheck · evaluate · toSql                           │  │
│  └────────────────────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │  Platform contracts  (Lead — read-only for sub-agents)          │  │
│  │  src/platform/contracts/                                        │  │
│  └────────────────────────────────────────────────────────────────┘  │
└───────────────────────────────┬─────────────────────────────────────┘
                                │
┌───────────────────────────────▼─────────────────────────────────────┐
│  Postgres                                                             │
│  public schema: platform tables (tenants, apps, users, secrets …)    │
│  tenant_<slug> schema: per-tenant data tables (DDL managed by Agent A)│
└─────────────────────────────────────────────────────────────────────┘
```

---

## 2. Contracts — the shared language

`src/platform/contracts/` is the **only** cross-agent import boundary.

| File | Owns |
|---|---|
| `fields.ts` | `FieldDef`, all `FieldType` unions, all options shapes |
| `tables.ts` | `TableDef`, `RelationDef`, engine configs, `AppDefinition` |
| `access.ts` | `AccessPolicy`, `FieldPermission`, `UserOverride`, `RoleDef`, `LocationDef` |
| `rules.ts` | `RuleDef`, `TriggerDef`, `ActionDef`, `WorkflowDef`, `ApprovalChainDef`, `ScriptDef` |
| `ui.ts` | `PageDef`, `ComponentDef`, `QueryDef`, `ThemeTokens` |
| `integrations.ts` | `ConnectorDef`, `DocTemplateDef` |
| `index.ts` | Barrel re-export — **always import from here** |

**Rules:**
- Sub-agents import from `@/platform/contracts` (barrel), never from individual contract files directly.
- Sub-agents **never modify** contract files. File an issue / PR against the Lead branch.
- Contract types are plain TypeScript interfaces — no runtime code, no imports from application code.

---

## 3. Expression engine interface

`src/platform/expr/index.ts` defines `ExprEngine`.

```
parse(source) → CompiledExpr        (syntax check, no I/O)
typeCheck(expr, fieldTypes) → result (static analysis)
evaluate(expr, ctx) → ExprValue     (pure, no side-effects)
evaluateSource(source, ctx) → ExprValue  (parse + eval)
toSql(expr, fieldTypes) → SqlFragment | null  (for Postgres RLS)
```

**Who calls it:**

| Agent | Use |
|---|---|
| A | `typeCheck` at schema publish time; `evaluate` for defaults/auto-number |
| B | Implements it |
| C | `toSql` → embedded in `CREATE POLICY` statements; `evaluate` for in-process fallback |
| D | `evaluate` for conditional `visible` / `required` / `readOnly` on form fields |
| E | `evaluate` for template bindings in DocTemplateDef |

The concrete implementation is registered as `EXPR_ENGINE` (Symbol DI token).
Never import the implementation file directly; import the interface from `@/platform/expr`.

---

## 4. Database layout

### Platform schema (`public`)

```
tenants          id, slug, name, schema_name, plan, settings
platform_users   id, email, password_hash, tenant_id, role (platform_admin | tenant_admin | user)
tenant_sessions  (NextAuth session table)
apps             id, tenant_id, definition JSONB   ← AppDefinition stored here
app_versions     id, app_id, version, snapshot JSONB
platform_secrets id, app_id, name, encrypted_value  ← ConnectorDef secrets
sequences        id, app_id, sequence_id, counter, reset_rule
audit_log        id, tenant_schema, table_name, record_id, user_id, diff JSONB, created_at
```

### Tenant schema (`tenant_<slug>`)

Agent A creates and migrates every table here from `TableDef`.

Conventions:
- Every table has `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`.
- Soft-delete tables add `deleted_at TIMESTAMPTZ`, `deleted_by UUID`, `delete_reason TEXT`.
- Audit tables add `_version INT DEFAULT 0`, `_created_at`, `_created_by`, `_updated_at`, `_updated_by`.
- Auto-number fields are `NOT NULL UNIQUE`, populated by a `BEFORE INSERT` trigger calling `nextval` on a named sequence in `public.sequences`.
- RLS is **always** enabled on every tenant table: `ALTER TABLE … ENABLE ROW LEVEL SECURITY; ALTER TABLE … FORCE ROW LEVEL SECURITY;`

---

## 5. Request lifecycle (happy path)

```
Browser                    API Route                   Postgres
  │                            │                           │
  │  POST /api/platform/       │                           │
  │  data/[table]/records      │                           │
  │ ─────────────────────────► │                           │
  │                            │ 1. getSession()           │
  │                            │ 2. load AppDefinition     │
  │                            │ 3. expr.typeCheck(fields) │
  │                            │ 4. SET LOCAL role =       │
  │                            │    'tenant_app_role'      │
  │                            │ 5. SET LOCAL claims =     │
  │                            │    { user, locations }    │
  │                            │ ──────────────────────── ►│
  │                            │                           │ RLS policies filter
  │                            │                           │ via current_setting()
  │                            │                           │ + expr engine toSql()
  │                            │ ◄─────────────────────── │
  │                            │ 6. evaluate computed fields
  │                            │ 7. fire workflow triggers │
  │ ◄───────────────────────── │                           │
```

---

## 6. Security invariants

1. **Tenant isolation** — every query runs under a Postgres role that has access only to `tenant_<slug>`. Cross-schema queries are impossible.
2. **RLS always on** — Agent C must never create a table without `FORCE ROW LEVEL SECURITY`. Superuser bypass is never used in application code.
3. **Expression sandboxing** — `ExprEngine.evaluate` must not call `eval`, `Function`, or any OS/network API. Any attempt throws `ExprEvalError`.
4. **Secrets never in JSONB** — `ConnectorDef` stores only `SecretRef`. The actual value lives in `platform_secrets` (AES-256-GCM encrypted at rest) and is injected at runtime by Agent E's integration runner.
5. **File uploads** — magic-byte validation rejects SVG/HTML regardless of claimed MIME type (see `src/lib/storage.ts`).
6. **Auth** — NextAuth JWT, `token_version` field invalidates all sessions on password change, TOTP mandatory for platform admins.

---

## 7. Sub-agent boundaries

Each agent owns **exactly** the folders listed below. No cross-writes.

| Agent | Branch | Folders |
|---|---|---|
| A | `wave1/agent-a` | `src/platform/data/`, `migrations/platform/` |
| B | `wave1/agent-b` | `src/platform/expr/` *(except `index.ts`)* |
| C | `wave1/agent-c` | `src/platform/access/` |
| D | `wave1/agent-d` | `src/components/ui/`, `src/styles/` |
| E | `wave1/agent-e` | `src/platform/integrations/` |

**Shared read-only** (no agent writes here):
- `src/platform/contracts/` — owned by Lead
- `src/platform/expr/index.ts` — owned by Lead

---

## 8. Wave 1 gate

> An admin builds a **Purchase Order** table with lines, per-line GST formulas, totals,
> PO-2026-0001 numbering, lock-after-approval, and "users see only their location" —
> **with no code changes**. Proved by integration tests.

Checklist:
- [ ] A: `TableDef` publish creates PO + PO Lines tables in tenant schema
- [ ] A: `AutoNumberOptions` → PO-{YEAR}-{seq:04d} works
- [ ] B: `FormulaFieldOptions` → `line_total = qty * unit_price`, `gst_amount = line_total * 0.18`
- [ ] B: `RollupFieldOptions` → `po_total = SUM(lines.line_total)`
- [ ] B: `RuleDef` lock → `status = 'Approved'` makes record read-only
- [ ] C: `AccessPolicy` → `record.location_id in user.locations` applied as Postgres RLS
- [ ] Integration test suite: creates app, publishes TableDef, inserts PO, asserts all of the above
