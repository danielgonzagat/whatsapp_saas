# adm.kloel.com — Foundation + IAM — Implementation Plan

**Plan ID:** SP-0..2 plan **Spec:**
[2026-04-15-adm-kloel-foundation-iam-design.md](../specs/2026-04-15-adm-kloel-foundation-iam-design.md)
**Branch:** `feat/adm-foundation-iam` **Date:** 2026-04-15

## Ordered steps

Each step has: what, why, how to verify, how to roll back.

### Step 1 — Prisma schema + migration

**What.** Add 5 new models ( `AdminUser` , `AdminPermission` , `AdminSession` ,
`AdminAuditLog` ,
`AdminLoginAttempt` ) + 2 enums ( `AdminRole` , `AdminUserStatus` ,
`AdminModule` , `AdminAction` ) to
`backend/prisma/schema.prisma` . Generate migration. Append raw SQL for
append-only triggers.

**Why.** All backend services and seed depend on these tables.

**Verify.** `cd backend && npx prisma validate && npx prisma migrate dev --name
admin_identity_foundation --create-only `. Review generated SQL. Then ` npx
prisma migrate dev`.
Confirm tables exist locally via psql.

**Rollback.** `npx prisma migrate resolve --rolled-back <name>` plus manual
`DROP TABLE` if local DB
is dirty. Branch-level: `git checkout main -- backend/prisma`.

### Step 2 — Backend common: crypto + decorators + error shape

**What.** Create `admin/common/admin-crypto.ts` (AES-256-GCM),
`admin/auth/decorators/` (AdminRole,
AdminPermission, CurrentAdmin, AllowPendingMfa, NoAudit),
`admin/common/admin-api-error.ts` .

**Why.** Shared primitives used by every downstream file.

**Verify.** Unit test AES-256-GCM round trip with a fixed key.

### Step 3 — Backend audit module

**What.** `admin/audit/admin-audit.service.ts` (append-only) +
`admin-audit.interceptor.ts` (global
on admin module) + `admin-audit.controller.ts` (paginated GET).

**Why.** Every subsequent auth/user action must produce a row. Ship this first
so it is available to
other services.

**Verify.** Unit test: calling `append()` creates a row; trying `update` on that
row throws.
Integration probe: hit a temp controller, assert audit row appears.

### Step 4 — Backend permissions module

**What.** `admin/permissions/admin-permissions.defaults.ts` (matrix) +
`admin-permissions.service.ts` (query, seed user defaults, override).

**Why.** Needed by guards in Step 5.

**Verify.** Permutation test loops every `(role, module, action)` triple and
asserts `allows()`
matches the matrix.

### Step 5 — Backend auth module

### What.

- `admin-auth.service.ts` : bcrypt, JWT (separate `JwtService` instance),
  refresh rotation, login
  state machine (password_change → mfa_setup → mfa_verify → authenticated).
- `admin-mfa.service.ts` : TOTP via `otplib` (already in backend? verify;
  install if not), QR
  generation via `qrcode`, AES-wrap secret at rest.
- `admin-auth.controller.ts` : `/admin/auth/login` ,
  `/admin/auth/change-password` ,
  `/admin/auth/mfa/setup` , `/admin/auth/mfa/verify-initial` ,
  `/admin/auth/mfa/verify` ,
  `/admin/auth/refresh`, `/admin/auth/logout`.
- Guards: `AdminAuthGuard` , `AdminMfaEnforcedGuard` , `AdminRoleGuard` ,
  `AdminPermissionGuard` .
- `AdminLoginAttemptsService` + rate-limiter guard on login.

**Why.** Core identity. Nothing else in the admin module runs without this.

### Verify.

- Unit tests on guards, on bcrypt flow, on TOTP verify (fixed time + fixed
  secret).
- Integration test: full login → password change → MFA setup → MFA verify →
  protected route →
  refresh → logout sequence, asserting audit rows at each step.
- Rate-limit test: 6 failed logins within 15 min → 6th returns 429 and row is
  locked.

### Step 6 — Backend users module

**What.** `admin-users.controller.ts` (CRUD under `/admin/users` , OWNER-only
for creating OWNER),
`admin-users.service.ts` , DTOs. Set-permissions endpoint for OWNER to override
defaults.

**Why.** Required for IAM screen (SP-11 uses it, but the endpoint must exist for
Perfil/Sessions to
be meaningful).

**Verify.** Unit test I-ADMIN-6 (non-OWNER trying to create OWNER → 403). Unit
test default
permissions seeding.

### Step 7 — Backend sessions module

**What.** `admin-sessions.controller.ts` — list own sessions, revoke own, OWNER
revoke any. Service
already partially built in Step 5 (session creation on login) — this just
exposes the API.

**Why.** Needed by the /perfil page in SP-2.

**Verify.** Integration test: user with 2 active sessions revokes one, list
shows 1 active.

### Step 8 — Backend seed

**What.** `admin-seed.service.ts` with `onModuleInit` . Upsert Daniel's OWNER
account.

**Why.** Makes `adm.kloel.com` usable immediately after migration deploy.

**Verify.** Run backend locally, confirm one row in `admin_users` with Daniel's
email. Run twice,
confirm still one row. Assert `mfa_pending_setup=true` and
`password_change_required=true` .

### Step 9 — Wire admin module into `app.module.ts`

**What.** Import `AdminModule` into root `AppModule` . Register global
interceptor scoped to
`/admin/*` only. Register new env vars in `config/configuration.ts` if that
pattern exists.

**Verify.** `npm run build` in backend is green. Nest boot smoke:
`npm run start:dev` shows `[Nest]
... Mapped {/admin/auth/login, POST}`.

### Step 10 — Backend tests + lint + typecheck + build green

**Verify.**
`cd backend && npm run lint && npm run typecheck && npm test && npm run build` .
All
green. Zero regressions.

**Note.** Biome on backend is hazardous per memory
`feedback_biome_backend_di_hazard` — do NOT run
`biome --write` unless using the temp config that disables organizeImports and
enables
unsafeParameterDecoratorsEnabled. Manual import placement is safer here.

### Step 11 — Frontend-admin scaffold

**What.** `mkdir frontend-admin` . `package.json` , `tsconfig.json` ,
`next.config.ts` ,
`tailwind.config.ts` , `postcss.config.mjs` , `biome.json` , `vitest.config.ts`
, `.env.example` ,
`.gitignore`. Install dependencies (pinned to match frontend).

**Verify.** `cd frontend-admin && npm install` succeeds. `npx next --version`
matches frontend's
next version.

### Step 12 — Frontend-admin design tokens + globals + fonts + layout

**What.** Copy `frontend/src/lib/design-tokens.ts` →
`frontend-admin/src/lib/design-tokens.ts`
byte-for-byte. Copy `frontend/src/app/globals.css` →
`frontend-admin/src/app/globals.css` (strip any
selectors that reference kloel-only IDs, keep CSS vars). Create
`frontend-admin/src/app/fonts.ts`
with Sora + JetBrains Mono via `next/font/google` . Create
`frontend-admin/src/app/layout.tsx` with
fonts + theme provider + toast provider.

**Verify.**
`diff frontend/src/lib/design-tokens.ts frontend-admin/src/lib/design-tokens.ts`
prints
nothing. `next build` succeeds.

### Step 13 — Frontend-admin shadcn primitives + theme-provider

**What.** Add shadcn components manually (no `npx shadcn@latest init` — it might
overwrite things).
Hand-write the minimum: `button` , `input` , `card` , `label` , `toast` ,
`dialog` , `separator` ,
`avatar` , `dropdown-menu` , `badge` , `table` , `skeleton` . Each uses Radix
primitives + Tailwind +
CVA. `theme-provider.tsx` wraps `next-themes`.

**Verify.** Each primitive compiles standalone. Import chain works in a toy
page.

### Step 14 — Frontend-admin api client + session storage

**What.** `lib/api/admin-client.ts` with `fetch` wrapper that: reads access
token from storage,
handles 401 by trying refresh once, returns typed JSON.
`lib/api/admin-auth-api.ts` calls
login/change-password/mfa/refresh/logout. `lib/auth/admin-session-storage.ts`
stores access token in
memory + refresh in httpOnly cookie (set by API route).
`lib/auth/admin-session-context.tsx`
provides session + user to React tree.

**Verify.** Unit test storage and refresh logic with a fake fetch.

### Step 15 — Frontend-admin middleware

**What.** `src/middleware.ts` that protects `/(admin)/*` — if no session cookie,
redirect to
`/login` . Handles `/mfa/*` and `/change-password` specially (require their
short-lived token, not a
full session).

**Verify.** Manually test: visit `/(admin)/perfil` without session → redirected
to `/login` .

### Step 16 — Frontend-admin login + change-password + MFA setup + MFA verify

**What.** Four pages replicating the visual DNA of `KloelAuthScreen`:

- `/login` — email + password, calls `/admin/auth/login` , branches based on
  returned state.
- `/change-password` — new password + confirm, requires `changeToken`.
- `/mfa/setup` — displays QR + entry field, requires `setupToken` . On verify,
  transitions to
  authenticated.
- `/mfa/verify` — 6-digit input, requires `mfaToken`.

Each page uses the shared `AuthScreenChrome` component for visual consistency.

**Verify.** Manual flow: log in → change password → setup MFA → enter code →
land on `/(admin)` .

### Step 17 — Frontend-admin `(admin)` layout + sidebar + topbar + greeting

**What.** `(admin)/layout.tsx` wraps children in `AdminSidebar` + main content.
`admin-sidebar.tsx`
mirrors the anatomy of `KloelSidebar` (expansible, retractable, grouped
sections).
`admin-sidebar-config.ts` has the menu from the spec. `admin-topbar.tsx` has
notification bell
skeleton + avatar dropdown with "Perfil", "Sair". `admin-greeting.tsx` renders
time-based salutation
with admin's first name.

**Verify.** Mount `/(admin)` page shows greeting + sidebar; click Sair logs out.

### Step 18 — Frontend-admin honest placeholders for every module route

**What.** Create 10 routes under `(admin)/` (produtos, marketing, vendas,
carteira, relatorios,
contas, compliance, clientes, configuracoes, perfil, audit). Each returns
`<HonestPlaceholder
module=... plannedSubProject=... description=... /> ` except ` perfil
` (real) and ` audit` (real,
read-only).

**Verify.** Click each sidebar item, see the placeholder card.

### Step 19 — Frontend-admin perfil page (REAL)

**What.** `/(admin)/perfil` shows: name, email, role, created_at, last_login_at,
mfa_enabled, active
sessions list with "Revogar" button per session, "Trocar senha" button. Reads
from
`/admin/users/me`, `/admin/sessions/me`.

**Verify.** Daniel logs in, sees his data, revokes a session.

### Step 20 — Frontend-admin audit page (REAL, read-only)

**What.** `/(admin)/audit` shows paginated audit log with filters (admin user,
action, date range).
Reads from `/admin/audit`.

**Verify.** Daniel sees his own seed event and login event.

### Step 21 — Frontend-admin tests + lint + typecheck + build

**Verify.**
`cd frontend-admin && npm run lint && npm run typecheck && npm test && npm run build`
all green.

### Step 22 — Visual contract scan

**What.** Extend `scripts/ops/check-visual-contract.mjs` to also lint
`frontend-admin/` and to diff
`frontend/src/lib/design-tokens.ts` vs `frontend-admin/src/lib/design-tokens.ts`
(must be
byte-equal). **But `check-visual-contract` is in the protected list in
`CLAUDE.md` ** — do NOT edit
it directly. Instead, write a NEW script
`scripts/ops/check-admin-token-parity.mjs` that only diffs
the two token files, and add it to husky pre-push. The existing visual contract
script already scans
`frontend/` — we rely on a sibling run for admin.

**Verify.** New script executes, exits 0.

### Step 23 — Root monorepo wiring

**What.** Add `frontend-admin` to the root `package.json` workspaces (if it uses
workspaces) or to
lint-staged, husky, and GitHub Actions matrix (build + test + lint for admin on
every push). Add
`frontend-admin/` to `.gitignore` exclusions (e.g. `.next`, `node_modules`).

**Verify.** Root `npm run lint` and `npm run build` include admin.

### Step 24 — PULSE scan baseline

**What.** Run PULSE locally. Expect no red issues attributable to admin. Update
the PULSE manifest
if it requires registering the new frontend-admin app.

**Verify.**
`npx ts-node --project scripts/pulse/tsconfig.json scripts/pulse/index.ts`
reports admin
as a clean new scope.

### Step 25 — Commit, push, open PR

**What.** Commit in logical chunks (Prisma schema + migration; backend admin
module; frontend-admin
scaffold; frontend-admin pages; root wiring + docs). Push branch. Open PR with
filled-in template.

**Verify.** PR CI runs and goes green (or reports issues we fix immediately).

### Step 26 — Vercel project `kloel-admin`

### What.

```
vercel link --project kloel-admin --yes --token $VERCEL_TOKEN \
  --scope $VERCEL_TEAM_ID --cwd frontend-admin
vercel env add NEXT_PUBLIC_ADMIN_API_URL production ...
vercel deploy --prebuilt=false --prod=false --token $VERCEL_TOKEN \
  --scope $VERCEL_TEAM_ID --cwd frontend-admin
```

Project didn't exist — `vercel link` with `--yes` will create it. Set Node 24.x,
rootDirectory via
`.vercel/project.json` or Vercel UI fallback.

**Verify.** Preview URL builds and responds 200 on `/login`.

### Step 27 — Railway env vars + migrate deploy

**What.** Set `ADMIN_JWT_SECRET` , `ADMIN_MFA_ENCRYPTION_KEY` ,
`ADMIN_MFA_ISSUER` ,
`ADMIN_SESSION_TTL_HOURS` , `ADMIN_ACCESS_TOKEN_TTL_MINUTES` ,
`ADMIN_ALLOWED_ORIGINS` via `railway
variables set ... --token $RAILWAY_PROJECT_TOKEN `. Trigger ` prisma migrate
deploy` on Railway
(Railway's post-deploy hook should already run it — verify).

**Verify.** Railway logs show migration applied.
`curl -X POST <railway>/admin/auth/login` returns
400 (DTO validation) rather than 500 or 404.

### Step 28 — Domain `adm.kloel.com`

**What.**
`vercel domains add adm.kloel.com --token $VERCEL_TOKEN --scope $VERCEL_TEAM_ID`
. Capture
the CNAME target Vercel returns. Output a ready-to-paste cPanel instruction for
Daniel (value, TTL,
record type).

**Verify.** After Daniel creates CNAME, run `dig +short adm.kloel.com` in a loop
until it returns
the Vercel target. Then `vercel alias set <deployment-url> adm.kloel.com`.

### Step 29 — Production smoke test

**What.** `curl -sf https://adm.kloel.com/login > /dev/null` succeeds. Log in
with Daniel's account
(browser), confirm password-change → MFA setup → MFA verify flow lands on
greeting.

**Verify.** Record in `VALIDATION_LOG.md` with timestamp.

### Step 30 — Mark tasks complete + report

**What.** `TaskUpdate` #1..#5 to completed. Write a summary to Daniel with: PR
link, preview URL,
prod URL, CNAME instruction (if not yet wired), list of env vars set,
outstanding issues, next SP to
start.

## Review checkpoints

- **Checkpoint A** (after Step 10): backend green. Safe rollback point — if
  anything worries me, I
  revert and regroup.
- **Checkpoint B** (after Step 21): frontend-admin green locally.
- **Checkpoint C** (after Step 25): PR open, CI green.
- **Checkpoint D** (after Step 29): production smoke green.

At each checkpoint I announce to Daniel and continue (he authorized full
autonomy) unless something
unexpected shows up.

## What I will NOT do in this plan

- Touch `frontend/` code (regression risk).
- Write real data to any admin module (spec forbids it).
- Bypass `check-visual-contract` or PULSE.
- Modify any protected file from `CLAUDE.md`.
- Skip hooks with `--no-verify`.
- Force-push.
- Amend commits.
- Deploy before backend + frontend-admin builds are green.
- Create Vercel project without showing Daniel the project name first (already
  approved:
  `kloel-admin`).
- Ask Daniel for PR review (he explicitly opted out).
