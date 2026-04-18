# adm.kloel.com — Foundation + Identity & Access Management

**Spec ID:** SP-0..2 (Foundation, IAM, Shell)
**Date:** 2026-04-15
**Author:** Claude (Opus 4.6) under Daniel's direction
**Branch:** `feat/adm-foundation-iam`
**Status:** Approved by Daniel on 2026-04-15, executing.

## 1. Purpose

Stand up `adm.kloel.com` — the administrative control plane of the KLOEL platform — as a standalone Next.js application with rock-solid identity, 2FA, and granular permissions **before** any operational module (dashboards, transactions, wallet, compliance) is built on top. This spec covers the minimum viable admin shell: login, MFA enroll/verify, greeting, sidebar, empty honest placeholders for every future module, and the backend identity system they will all depend on.

## 2. Non-goals (deferred to later sub-projects)

- No real data in any admin module screen (Home/Vendas/Carteira/etc. are honest placeholders here — they land in SP-3..13).
- No admin AI chatbar functionality (skeleton only; wired in SP-14 after permissions are proven safe).
- No destructive actions on production data (refund, block, hold) — those come in SP-8 with idempotency + dual control.
- No impersonation ("view as producer").
- No IP allowlist enforcement (model supports it; UI + enforcement in SP-11).

## 3. Architecture

### 3.1 Repository layout

- **No monorepo refactor.** `frontend/` and `backend/` remain untouched in place.
- **New sibling app**: `frontend-admin/` — standalone Next.js 16 / React 19 / Tailwind v4 app with its own `package.json`, `tsconfig.json`, `next.config.ts`, `postcss.config.mjs`.
- **No cross-app imports.** Visual parity with `app.kloel.com` is enforced by **identity of design tokens** (`design-tokens.ts` copied byte-for-byte) + same dependency versions + `scripts/ops/check-visual-contract.mjs` running in CI against both apps. Future SP will extract `packages/ui` if the copy cost grows.
- **New backend feature module**: `backend/src/admin/` — sibling of `auth/`, `workspaces/`, etc. All routes live under `/admin/*`. Shares the same NestJS process, Railway service, and Prisma client as the rest of the backend.

### 3.2 Deploy topology

- Backend: **unchanged**. Same Railway service. Gains new Prisma migrations + new routes + new env vars.
- Frontend (`kloel-frontend` Vercel project): **unchanged**.
- Admin frontend: **new Vercel project `kloel-admin`**, team `team_x9F030En3sPT9Ti4vAj3FCcJ`, rootDirectory `frontend-admin`, Node 24.x, framework preset Next.js, domain `adm.kloel.com`.
- DNS: HostGator cPanel — Daniel creates CNAME `adm` → `cname.vercel-dns.com` manually once, triggered by this SP's deploy step. No automation is possible because HostGator lacks a usable API.

## 4. Security invariants

| ID         | Invariant                                                                                                                                | Enforcement                                                                                                                          |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| I-ADMIN-1  | `admin_audit_logs` is append-only. No UPDATE, no DELETE, ever.                                                                           | PostgreSQL trigger `admin_audit_logs_no_mutate` raises exception on UPDATE/DELETE. Prisma middleware also blocks.                    |
| I-ADMIN-2  | Every authenticated admin mutation writes one `admin_audit_logs` row before the HTTP response commits.                                   | Global `AdminAuditInterceptor` on `/admin/*`. Unit-tested on representative controllers.                                             |
| I-ADMIN-3  | `admin_users.mfa_secret` never leaves the backend; stored encrypted at rest.                                                             | AES-256-GCM with `ADMIN_MFA_ENCRYPTION_KEY`; decrypted only inside `AdminAuthService.verifyTotp`.                                    |
| I-ADMIN-4  | Admin JWT uses a dedicated secret `ADMIN_JWT_SECRET`, **different** from `AUTH_SECRET`. Compromise of one does not compromise the other. | Separate `JwtModule` registration inside `AdminAuthModule`. Asymmetric audience claims (`aud: 'adm.kloel.com'`).                     |
| I-ADMIN-5  | After 5 failed logins in 15 minutes for the same email OR the same IP, lock for 15 min.                                                  | `admin_login_attempts` table + `AdminRateLimiter` guard on `POST /admin/auth/login`.                                                 |
| I-ADMIN-6  | `admin_users.role = 'OWNER'` may only be assigned by another OWNER.                                                                      | Service-layer check + dedicated test.                                                                                                |
| I-ADMIN-7  | Default-deny on permissions: absence of an `admin_permissions` row means denied. OWNER bypasses the check entirely.                      | `AdminPermissionGuard` short-circuits for OWNER; otherwise looks up `(admin_user_id, module, action, allowed=true)`.                 |
| I-ADMIN-8  | First login after seed forces MFA setup before access to any protected route.                                                            | `mfa_pending_setup=true` on seed; login returns `mfa_setup_required` state; all guards reject until `mfa_enabled=true`.              |
| I-ADMIN-9  | First login after seed forces password change before access to any protected route.                                                      | `password_change_required=true` on seed; guards return `password_change_required` state until cleared.                               |
| I-ADMIN-10 | Session tokens are hashed in DB (SHA-256), never stored plain. Server keeps only the hash.                                               | `admin_sessions.token_hash` column; `bcrypt` not used here because we need fast lookup, SHA-256 over a 256-bit random is sufficient. |

Explicit non-invariant: we do NOT require IP allowlist in SP-0..2. `admin_users` has a nullable `allowed_ips` JSON column; enforcement lands in SP-11.

## 5. Data model — new Prisma models

All models live in `backend/prisma/schema.prisma` under the `AdminUsers` block (grouped comment separator). Table names use `admin_` snake_case prefix via `@@map`.

### AdminUser

```prisma
model AdminUser {
  id                       String              @id @default(cuid())
  name                     String
  email                    String              @unique
  passwordHash             String              @map("password_hash")
  role                     AdminRole           @default(STAFF)
  status                   AdminUserStatus     @default(ACTIVE)
  mfaSecret                String?             @map("mfa_secret")           // encrypted AES-256-GCM
  mfaEnabled               Boolean             @default(false) @map("mfa_enabled")
  mfaPendingSetup          Boolean             @default(true)  @map("mfa_pending_setup")
  passwordChangeRequired   Boolean             @default(true)  @map("password_change_required")
  allowedIps               Json?               @map("allowed_ips")          // null = unrestricted; SP-11 enforces
  lastLoginAt              DateTime?           @map("last_login_at")
  failedLoginCount         Int                 @default(0)     @map("failed_login_count")
  lockedUntil              DateTime?           @map("locked_until")
  createdAt                DateTime            @default(now()) @map("created_at")
  updatedAt                DateTime            @updatedAt      @map("updated_at")
  createdById              String?             @map("created_by_id")
  createdBy                AdminUser?          @relation("AdminUserCreatedBy", fields: [createdById], references: [id])
  createdAdmins            AdminUser[]         @relation("AdminUserCreatedBy")
  permissions              AdminPermission[]
  sessions                 AdminSession[]
  auditLogs                AdminAuditLog[]

  @@index([email])
  @@index([status, role])
  @@map("admin_users")
}

enum AdminRole { OWNER MANAGER STAFF }
enum AdminUserStatus { ACTIVE SUSPENDED DEACTIVATED }
```

### AdminPermission

```prisma
model AdminPermission {
  id          String            @id @default(cuid())
  adminUserId String            @map("admin_user_id")
  adminUser   AdminUser         @relation(fields: [adminUserId], references: [id], onDelete: Cascade)
  module      AdminModule
  action      AdminAction
  allowed     Boolean           @default(true)
  createdAt   DateTime          @default(now()) @map("created_at")

  @@unique([adminUserId, module, action])
  @@map("admin_permissions")
}

enum AdminModule {
  HOME PRODUTOS MARKETING VENDAS CARTEIRA RELATORIOS
  CONTAS COMPLIANCE CLIENTES CONFIGURACOES IAM PERFIL AUDIT_LOG
}

enum AdminAction { VIEW CREATE EDIT DELETE APPROVE EXPORT }
```

### AdminSession

```prisma
model AdminSession {
  id           String     @id @default(cuid())
  adminUserId  String     @map("admin_user_id")
  adminUser    AdminUser  @relation(fields: [adminUserId], references: [id], onDelete: Cascade)
  tokenHash    String     @unique @map("token_hash")   // SHA-256 hex of raw refresh token
  ip           String
  userAgent    String     @map("user_agent")
  createdAt    DateTime   @default(now()) @map("created_at")
  expiresAt    DateTime   @map("expires_at")
  revokedAt    DateTime?  @map("revoked_at")

  @@index([adminUserId, revokedAt])
  @@index([expiresAt])
  @@map("admin_sessions")
}
```

### AdminAuditLog

```prisma
model AdminAuditLog {
  id           String     @id @default(cuid())
  adminUserId  String?    @map("admin_user_id")        // nullable for system-originated events
  adminUser    AdminUser? @relation(fields: [adminUserId], references: [id], onDelete: SetNull)
  action       String                                   // e.g. "admin.auth.login", "admin.users.create"
  entityType   String?    @map("entity_type")
  entityId     String?    @map("entity_id")
  details      Json?
  ip           String?
  userAgent    String?    @map("user_agent")
  createdAt    DateTime   @default(now()) @map("created_at")

  @@index([adminUserId, createdAt])
  @@index([action, createdAt])
  @@index([entityType, entityId])
  @@map("admin_audit_logs")
}
```

Append-only enforced by a raw SQL migration appended to the same migration file:

```sql
CREATE OR REPLACE FUNCTION admin_audit_logs_block_mutation()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'admin_audit_logs is append-only (I-ADMIN-1)';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER admin_audit_logs_no_update
BEFORE UPDATE ON admin_audit_logs
FOR EACH ROW EXECUTE FUNCTION admin_audit_logs_block_mutation();

CREATE TRIGGER admin_audit_logs_no_delete
BEFORE DELETE ON admin_audit_logs
FOR EACH ROW EXECUTE FUNCTION admin_audit_logs_block_mutation();
```

### AdminLoginAttempt

```prisma
model AdminLoginAttempt {
  id         String   @id @default(cuid())
  email      String
  ip         String
  success    Boolean
  createdAt  DateTime @default(now()) @map("created_at")

  @@index([email, createdAt])
  @@index([ip, createdAt])
  @@map("admin_login_attempts")
}
```

Rows older than 24h are purged by a daily cron handler (deferred to SP-ops; for SP-0..2 the table just grows — acceptable for now).

## 6. Backend structure

```
backend/src/admin/
  admin.module.ts
  auth/
    admin-auth.module.ts
    admin-auth.controller.ts
    admin-auth.service.ts
    admin-jwt.strategy.ts
    admin-mfa.service.ts                 // TOTP encode/verify via otplib + AES-GCM on secret at rest
    dto/
      login.dto.ts
      mfa-setup.dto.ts
      mfa-verify.dto.ts
      change-password.dto.ts
      refresh.dto.ts
    guards/
      admin-auth.guard.ts                // JWT + session validity + user active + mfa_enabled
      admin-role.guard.ts                // @AdminRole('OWNER')
      admin-permission.guard.ts          // @AdminPermission('VENDAS','EDIT')
      admin-mfa-enforced.guard.ts        // allows /mfa/setup + /auth/change-password when pending
    decorators/
      admin-role.decorator.ts
      admin-permission.decorator.ts
      current-admin.decorator.ts
  users/
    admin-users.module.ts
    admin-users.controller.ts
    admin-users.service.ts
    dto/
      create-admin-user.dto.ts
      update-admin-user.dto.ts
      set-permissions.dto.ts
  permissions/
    admin-permissions.service.ts        // default matrix + user overrides
    admin-permissions.defaults.ts       // declarative matrix used in tests + seed
  audit/
    admin-audit.module.ts
    admin-audit.service.ts              // append() — only public method
    admin-audit.interceptor.ts          // auto-log on non-GET requests
    admin-audit.controller.ts           // GET /admin/audit
    dto/list-audit.dto.ts
  sessions/
    admin-sessions.service.ts
    admin-sessions.controller.ts        // list own, revoke own, OWNER revoke any
  rate-limit/
    admin-login-attempts.service.ts
  seed/
    admin-seed.service.ts               // onModuleInit idempotent upsert
  common/
    admin-api-error.ts
    admin-crypto.ts                     // AES-256-GCM wrap
```

All controllers use `@UseGuards(AdminAuthGuard)` by default. Endpoints that must work pre-MFA (`/mfa/setup`, `/mfa/verify`, `/auth/change-password`) are marked with `@AllowPendingMfa()` decorator that tells `AdminMfaEnforcedGuard` to let them through.

`AdminAuditInterceptor` is registered globally on the admin module. Any controller handler that is **not** a safe-idempotent `GET` (or explicitly marked `@NoAudit()`) results in one `admin_audit_logs` row containing: action name (`${controller}.${method}`), entityType/entityId extracted from route params if declared, and a sanitized slice of the request body (passwords, MFA codes, and tokens elided by a `sanitizeForAudit` helper).

## 7. Permission default matrix

Declared in `admin-permissions.defaults.ts` and asserted by unit test. Seeded on user create.

| Module \ Role | OWNER       | MANAGER     | STAFF                                                  |
| ------------- | ----------- | ----------- | ------------------------------------------------------ |
| HOME          | v/c/e/d/a/x | v/c/e/d/a/x | v                                                      |
| PRODUTOS      | all         | all         | v                                                      |
| MARKETING     | all         | all         | v                                                      |
| VENDAS        | all         | all         | v                                                      |
| CARTEIRA      | all         | all         | —                                                      |
| RELATORIOS    | all         | all         | v/x                                                    |
| CONTAS        | all         | all         | v/e (limited subset enforced at service layer in SP-4) |
| COMPLIANCE    | all         | all         | —                                                      |
| CLIENTES      | all         | v           | —                                                      |
| CONFIGURACOES | all         | —           | —                                                      |
| IAM           | all         | —           | —                                                      |
| AUDIT_LOG     | v/x         | v           | v                                                      |
| PERFIL        | all         | all         | all                                                    |

OWNER bypasses the guard. For MANAGER/STAFF, each "all" cell expands to six `AdminPermission` rows. The matrix is enforced by a permutation test: for every `(role, module, action)` combo, a fake JWT is constructed and a probe controller verified to return 200 or 403 as the matrix dictates.

## 8. Seed — OWNER account

```ts
// admin-seed.service.ts (onModuleInit, idempotent)
await prisma.adminUser.upsert({
  where: { email: 'danielgonzagatj@gmail.com' },
  update: {}, // seed never modifies existing rows
  create: {
    name: 'Daniel Gonzaga',
    email: 'danielgonzagatj@gmail.com',
    passwordHash: await bcrypt.hash('4n4jul142209A@', 12),
    role: 'OWNER',
    status: 'ACTIVE',
    mfaEnabled: false,
    mfaPendingSetup: true,
    passwordChangeRequired: true,   // per Daniel's decision 2026-04-15 — forced change on first login
  },
});
// No AdminPermission rows: OWNER bypasses the permission guard.
await prisma.adminAuditLog.create({
  data: { action: 'admin.seed.owner_upserted', entityType: 'AdminUser', entityId: <id> },
});
```

## 9. Auth flow

1. `POST /admin/auth/login { email, password }`
   - Rate limit check (I-ADMIN-5).
   - Bcrypt verify.
   - Failure: increment `admin_login_attempts`, maybe set `locked_until`, audit log.
   - Success: reset `failed_login_count`.
   - If `password_change_required`: return `{ state: 'password_change_required', changeToken }` — a short-lived JWT (5 min, dedicated audience `admin-password-change`) that ONLY authorizes `POST /admin/auth/change-password`.
   - Else if `mfa_pending_setup`: return `{ state: 'mfa_setup_required', setupToken }` — short-lived JWT (10 min) authorizing `POST /admin/auth/mfa/setup` and `POST /admin/auth/mfa/verify-initial`.
   - Else if `mfa_enabled`: return `{ state: 'mfa_required', mfaToken }` — short-lived JWT (5 min) authorizing `POST /admin/auth/mfa/verify`.
2. `POST /admin/auth/change-password { newPassword }` (with `changeToken`): hash, clear `password_change_required`, audit, return new state transition.
3. `POST /admin/auth/mfa/setup` (with `setupToken`): generate TOTP secret, encrypt with `ADMIN_MFA_ENCRYPTION_KEY`, return otpauth URL + QR base64. Does NOT persist `mfa_enabled=true` yet.
4. `POST /admin/auth/mfa/verify-initial { code }` (with `setupToken`): verify TOTP. On success, set `mfa_enabled=true`, `mfa_pending_setup=false`, audit, return full session (access + refresh).
5. `POST /admin/auth/mfa/verify { code }` (with `mfaToken`): verify TOTP. On success, return full session.
6. `POST /admin/auth/refresh { refreshToken }`: checks `admin_sessions` row by token hash, validates expiry + not revoked, rotates token.
7. `POST /admin/auth/logout`: marks current session revoked.

Access tokens: 15-minute TTL, `HS256`, audience `adm.kloel.com`. Refresh tokens: 8-hour TTL (matches `ADMIN_SESSION_TTL_HOURS`), rotated on every refresh, stored as SHA-256 hash in `admin_sessions.token_hash`.

## 10. Frontend-admin scaffold

### 10.1 Directory layout

```
frontend-admin/
  package.json                      // "name": "kloel-admin", same deps as frontend (pinned versions)
  tsconfig.json                     // @/* → ./src/*
  next.config.ts                    // Sentry, Codecov, build-time env var check
  postcss.config.mjs                // @tailwindcss/postcss
  tailwind.config.ts                // shadcn preset, content globs
  biome.json / eslint.config.mjs    // mirror frontend's lint rules
  vitest.config.ts
  .env.example
  src/
    app/
      globals.css                   // copied from frontend, Monitor CSS vars
      fonts.ts                      // Sora + JetBrains Mono via next/font/google
      layout.tsx                    // root: fonts + providers
      page.tsx                      // redirect → /login or /(admin) depending on cookie
      login/page.tsx
      mfa/
        setup/page.tsx
        verify/page.tsx
      change-password/page.tsx
      (admin)/
        layout.tsx                  // sidebar + topbar + notification skeleton + chatbar skeleton
        page.tsx                    // greeting + minimal dashboard shell
        produtos/page.tsx           // "Em construção — SP-5"
        marketing/page.tsx          // idem SP-13
        vendas/page.tsx             // idem SP-6
        carteira/page.tsx           // idem SP-9
        relatorios/page.tsx         // idem SP-10
        contas/page.tsx             // idem SP-4
        compliance/page.tsx         // idem SP-7
        clientes/page.tsx           // idem SP-12
        configuracoes/page.tsx      // idem SP-11 (OWNER only, 403 otherwise)
        perfil/page.tsx             // dados, 2FA status, sessões ativas — REAL (this SP)
        audit/page.tsx              // REAL (this SP) — read-only log
    components/
      theme-provider.tsx            // next-themes wrapper
      ui/                           // shadcn primitives: button, input, card, label, toast, dialog, table, badge, separator, avatar, dropdown-menu
      admin/
        admin-sidebar.tsx           // mirrors KloelSidebar anatomy
        admin-sidebar-config.ts     // menu items with SP tags
        admin-topbar.tsx
        admin-greeting.tsx
        admin-chatbar-skeleton.tsx
        admin-notification-bell-skeleton.tsx
        honest-placeholder.tsx      // "Em construção — SP-X" card
        auth-screen-chrome.tsx      // visual parity with KloelAuthScreen
    lib/
      design-tokens.ts              // copied byte-for-byte from frontend/src/lib
      api/
        admin-client.ts             // fetch wrapper with access token
        admin-auth-api.ts
        admin-users-api.ts
        admin-sessions-api.ts
        admin-audit-api.ts
      auth/
        admin-session-storage.ts    // localStorage + cookie hybrid
        admin-session-context.tsx
      utils.ts                      // cn()
    middleware.ts                   // redirects unauthenticated → /login
```

### 10.2 Dependency strategy

`frontend-admin/package.json` pins the **exact same versions** as `frontend/package.json` for: next, react, react-dom, tailwindcss, @tailwindcss/postcss, lucide-react, framer-motion, next-themes, clsx, class-variance-authority, tailwind-merge, @radix-ui/\*, swr, @sentry/nextjs, vitest, @testing-library/\*, @vitejs/plugin-react. Extra: `otplib` and `qrcode` only on the backend; `otpauth-uri` already covered by backend.

No `fabric`, no `reactflow`, no `jspdf`, no legacy-provider — admin doesn't need them.

### 10.3 Visual parity

1. `frontend-admin/src/lib/design-tokens.ts` is an **identical copy** of `frontend/src/lib/design-tokens.ts`. A Codacy / CI guard (added to `scripts/ops/check-visual-contract.mjs`) diffs the two files byte-for-byte and fails CI on drift.
2. `frontend-admin/src/app/globals.css` copies the same CSS custom-property block (`--bg-void`, `--bg-surface`, `--app-accent`, …) from frontend's globals.
3. Fonts come from `next/font/google` — same family (Sora, JetBrains Mono), same weights.
4. `theme-provider.tsx` wraps `next-themes` identically.
5. shadcn primitives are added via `npx shadcn@latest add` using the same style config (`default`, Monitor palette CSS vars).
6. The login screen replicates the visual DNA of `KloelAuthScreen` but with admin copy ("Entrar no painel administrativo").

## 11. Honest placeholders

Every future module page returns the same component:

```tsx
<HonestPlaceholder
  module="Vendas"
  plannedSubProject="SP-6"
  description="Volume consolidado de todas as vendas da plataforma, com filtros, estornos e exportação."
/>
```

The card shows module name, planned SP, and one-line description. It **does not** fetch data. It does **not** show random numbers or loading skeletons that pretend to be fetching something. This is the "estados honestos" contract from `CLAUDE.md`.

## 12. Environment variables

### Backend (Railway)

- `ADMIN_JWT_SECRET` — 32-byte hex, generated with `openssl rand -hex 32`
- `ADMIN_MFA_ENCRYPTION_KEY` — 32-byte hex
- `ADMIN_MFA_ISSUER=Kloel Admin`
- `ADMIN_SESSION_TTL_HOURS=8`
- `ADMIN_ACCESS_TOKEN_TTL_MINUTES=15`
- `ADMIN_ALLOWED_ORIGINS=https://adm.kloel.com` (CORS)

### Frontend-admin (Vercel `kloel-admin`)

- `NEXT_PUBLIC_ADMIN_API_URL=https://<railway-backend-url>/admin`
- `NEXT_PUBLIC_APP_NAME=Kloel Admin`
- `NEXT_PUBLIC_SENTRY_DSN` (optional for SP-0..2)
- `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT` (optional)
- No `NEXT_PUBLIC_META_*`, no legacy payment provider, no legacy marketplace provider — admin does not need client payment SDKs.

All values are generated by Claude during the deploy step and pushed via `vercel env add` / `railway variables set` using tokens from `.env.pulse.local`.

## 13. Testing

- **Backend unit**: `AdminAuthService`, `AdminMfaService`, `AdminPermissionsService`, guards (`admin-auth.guard`, `admin-role.guard`, `admin-permission.guard`), rate limiter.
- **Backend integration**: full login ↔ change-password ↔ MFA setup ↔ MFA verify ↔ protected route ↔ refresh ↔ logout sequence, running against a SQLite/`vitest-prisma` or Postgres test container (mirror existing backend test strategy — read the existing test suite to match the pattern).
- **Permission matrix permutation test**: for every `(role, module, action)` in the defaults, constructs a JWT with that role, probes a test controller that requires exactly that permission, asserts 200 or 403 as declared. Guards the entire matrix in one file.
- **Audit append-only**: test attempts `UPDATE admin_audit_logs` and `DELETE` via raw SQL, asserts Postgres raises exception.
- **Seed idempotency**: running seed twice results in one row, same ID.
- **Frontend-admin unit**: `cn()`, session storage, greeting-by-hour helper.
- **Frontend-admin visual parity**: `check-visual-contract.mjs` passes, `design-tokens.ts` diff is empty.
- **Boot smoke**: backend boots cleanly (DI graph resolves), exposes `/admin/auth/login`. Frontend-admin `next build` succeeds.
- **E2E**: one happy-path Playwright test (deferred if Playwright infra is not set up on admin yet; boot smoke is the SP-0..2 gate).

## 14. Definition of done

1. Branch `feat/adm-foundation-iam` merged to `main` (or ready to merge, pending Daniel's word).
2. `backend/` lint + typecheck + build + unit tests green.
3. `frontend-admin/` lint + typecheck + build + unit tests green.
4. `frontend/` untouched (no regressions).
5. `check-visual-contract.mjs` green.
6. PULSE scan: no new red issues attributable to this branch.
7. Prisma migration applied to local dev DB successfully; migration file committed.
8. Seed executes on boot and creates Daniel's OWNER row.
9. Vercel project `kloel-admin` created, preview deployment green, env vars set.
10. CNAME instruction delivered to Daniel for HostGator.
11. Once CNAME propagates, production alias `adm.kloel.com` assigned, health check green.
12. Spec + plan committed under `docs/superpowers/`.
13. Tasks #1–#5 in the task tracker marked completed.

## 15. Risks and mitigations

| Risk                                                                                                           | Mitigation                                                                                                                          |
| -------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Prisma migration on prod DB via Railway could break other services on boot.                                    | Run migration in dev first. Inspect generated SQL before `railway run prisma migrate deploy`. Use `prisma migrate diff` for review. |
| Bcrypt work factor 12 makes login slow on cold start.                                                          | Acceptable for admin (low concurrency). Tests use factor 4 for speed.                                                               |
| Seed runs on every backend boot (`onModuleInit`).                                                              | Upsert with `update: {}` — idempotent.                                                                                              |
| `admin_audit_logs` trigger could block legitimate reads if someone mistakenly writes `UPDATE ... WHERE false`. | Trigger is BEFORE UPDATE FOR EACH ROW — only fires on matched rows; empty WHERE is a no-op.                                         |
| Frontend-admin drift from frontend styling over time.                                                          | `check-visual-contract.mjs` diff guard + policy that shared files are modified in sync. Future SP extracts `packages/ui`.           |
| HostGator CNAME step is manual and can delay go-live.                                                          | We deploy to `kloel-admin-*.vercel.app` first; domain is wired when Daniel has 2 minutes to click in cPanel. Nothing blocks on it.  |
| Daniel leaks credentials (already occurred).                                                                   | Declined rotation; memory note tracks. Rotation is post-session action. Non-negotiable: keys **never** committed.                   |

## 16. Explicit decisions captured from Daniel (2026-04-15)

- Option **C** (separate Next.js app `frontend-admin/`).
- Forced password change on first login + forced MFA setup on first login (stronger than prompt's "2FA pendente").
- Full autonomy on push + preview deploy + domain wiring; no PR pre-review.
- Single branch `feat/adm-foundation-iam` for SP-0..2.
- Credentials (Vercel token + IDs) stored in `.env.pulse.local`; rotation deferred.
